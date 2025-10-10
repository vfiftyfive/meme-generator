# Observability Setup for the GKE Demo

Follow these steps after the `meme-demo` cluster is created and credentials are in your kubeconfig.

## 1. Install Core Monitoring Stack
1. Ensure Helm is initialized: `helm repo add prometheus-community https://prometheus-community.github.io/helm-charts && helm repo update`.
2. Create the namespace and install kube-prometheus-stack with tailored values:
   ```bash
   kubectl create namespace monitoring
   helm install prometheus prometheus-community/kube-prometheus-stack \
     --namespace monitoring \
     -f k8s/monitoring/prometheus-values.yaml
   ```
3. Wait for Grafana, Prometheus, and kube-state-metrics pods to reach `Running`.

## 2. Enable Autoscaler Metrics
1. Install the Vertical Pod Autoscaler components (v1.5.1) and generate webhook certificates:
   ```bash
   # CRDs, RBAC, and deployments
   kubectl apply -f https://raw.githubusercontent.com/kubernetes/autoscaler/vertical-pod-autoscaler-1.5.1/vertical-pod-autoscaler/deploy/vpa-v1-crd-gen.yaml
   kubectl apply -f https://raw.githubusercontent.com/kubernetes/autoscaler/vertical-pod-autoscaler-1.5.1/vertical-pod-autoscaler/deploy/vpa-rbac.yaml
   kubectl apply -f https://raw.githubusercontent.com/kubernetes/autoscaler/vertical-pod-autoscaler-1.5.1/vertical-pod-autoscaler/deploy/recommender-deployment.yaml
   kubectl apply -f https://raw.githubusercontent.com/kubernetes/autoscaler/vertical-pod-autoscaler-1.5.1/vertical-pod-autoscaler/deploy/updater-deployment.yaml
   kubectl apply -f https://raw.githubusercontent.com/kubernetes/autoscaler/vertical-pod-autoscaler-1.5.1/vertical-pod-autoscaler/deploy/admission-controller-service.yaml
   kubectl apply -f https://raw.githubusercontent.com/kubernetes/autoscaler/vertical-pod-autoscaler-1.5.1/vertical-pod-autoscaler/deploy/admission-controller-deployment.yaml

   # Generate TLS assets expected by the admission controller
   tmpdir=$(mktemp -d) && cd "$tmpdir" && \
     openssl req -x509 -nodes -newkey rsa:2048 -keyout ca.key -out ca.crt -days 365 -subj "/CN=VPA-CA" && \
     openssl req -new -nodes -newkey rsa:2048 -keyout server.key -out server.csr -subj "/CN=vpa-webhook.kube-system.svc" && \
     openssl x509 -req -in server.csr -CA ca.crt -CAkey ca.key -CAcreateserial -out server.crt -days 365 \
       -extensions v3_ext -extfile <(printf "[v3_ext]\nsubjectAltName=DNS:vpa-webhook.kube-system.svc,DNS:vpa-webhook.kube-system.svc.cluster.local") && \
     kubectl delete secret vpa-tls-certs -n kube-system --ignore-not-found && \
     kubectl create secret generic vpa-tls-certs -n kube-system \
       --from-file=serverCert.pem=server.crt --from-file=serverKey.pem=server.key --from-file=caCert.pem=ca.crt && \
     cd - && rm -rf "$tmpdir"

   # Restart the admission controller so it mounts the new secret
   kubectl delete pod -n kube-system -l app=vpa-admission-controller
   ```
2. Install KEDA with Helm so ScaledObjects emit queue metrics:
   ```bash
   helm repo add kedacore https://kedacore.github.io/charts
   helm repo update
   helm install keda kedacore/keda --namespace keda --create-namespace
   ```
3. Apply the backend ServiceMonitor so Prometheus scrapes the Rust metrics endpoint:
   ```bash
   kubectl apply -k k8s/monitoring
   ```

## 3. Import Grafana Dashboards
1. Port-forward Grafana:
   ```bash
   kubectl port-forward -n monitoring svc/prometheus-grafana 3000:80
   ```
2. Log in (`admin/password`) and import `k8s/monitoring/complete-dashboard.json` via **+ → Import**.
3. Optional: run `k8s/monitoring/import-dashboard.sh` to automate port-forwarding and provide manual import instructions.

## 4. Verify Signals Before the Demo
- Check backend scrape success: query `meme_generator_requests_total` in Prometheus.
- Validate HPA metrics with `kube_horizontalpodautoscaler_status_desired_replicas`.
- Ensure KEDA metrics appear (`keda_scaledobject_desired_replicas`); if not, confirm the KEDA operator is healthy.
- Confirm VPA recommendation metrics exist: `vpa_recommendation_cpu_target` for `redis-vpa`.

> Capture screenshots of the dashboard once signals flow; they will be used to illustrate “before” and “after” states during the talk.

## 5. Application Secrets & Hugging Face Setup
- Create/refresh the Hugging Face token secret (replace the placeholder value in Git):
  ```bash
  kubectl create secret generic meme-generator-secrets \
    --namespace meme-generator \
    --from-literal=HF_API_TOKEN="<your-hf-token>" --dry-run=client -o yaml | kubectl apply -f -
  ```
- If your token only works with Hugging Face's router endpoints, override the backend URL (the demo cluster uses the FLUX model):
  ```bash
  kubectl set env deployment/meme-backend -n meme-generator \
    HF_API_URL=https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell
  kubectl rollout status deployment/meme-backend -n meme-generator
  ```
- Smoke-test the pipeline with the NATS CLI:
  ```bash
  # Subscribe (runs until a message arrives or timeout)
  kubectl run nats-sub --image=synadia/nats-box:latest --restart=Never \
    --command -- sh -c "nats sub meme.response --server nats://nats.messaging.svc.cluster.local:4222 --timeout=60s"

  # Publish a request (fast mode hits the FLUX endpoint)
  kubectl run nats-cli --image=synadia/nats-box:latest --restart=Never \
    --command -- sh -c "nats pub meme.request '{\"prompt\":\"demo meme\",\"fast_mode\":true,\"small_image\":true}' --server nats://nats.messaging.svc.cluster.local:4222"
  ```
  Inspect the subscriber logs for the base64 payload and delete the helper pods afterward (`kubectl delete pod nats-sub nats-cli`).

## 6. Staging the Autoscaler Conflict
- Remove the existing backend HPA, apply the KEDA ScaledObject, then recreate the manual HPA so both autoscalers exist for the chaos demo:
  ```bash
  kubectl delete hpa meme-backend -n meme-generator --ignore-not-found
  kubectl apply -f k8s/base/backend-keda-scaledobject.yaml
  kubectl apply -f k8s/base/backend-hpa.yaml
  ```
- Populate the EndpointSlice for `/ws` with the current NATS service IP (required because the ingress and NATS run in different namespaces):
  > Note: the NATS service ClusterIP (`kubectl get svc -n messaging nats -o jsonpath={.spec.clusterIP}`) is stable but not immutable—update `k8s/overlays/gke/nats-websocket-endpoint.yaml` if it ever changes.
  ```bash
  ./scripts/update-nats-endpoints.sh
  ```
- Confirm both HPAs are present and watching metrics before you start k6: `kubectl get hpa -n meme-generator`.
- Capture a baseline snapshot in Grafana once the conflict is staged—these are the “before” panels for the talk.

## 7. External DNS & Verification
- Update the Cloud DNS A record so `meme-generator.scaleops-labs.dev` points to the load-balancer IP (check with `kubectl get ingress meme-generator -n meme-generator`):
  ```bash
  gcloud dns record-sets transaction start --zone=scaleops-labs-dev
  gcloud dns record-sets transaction remove --zone=scaleops-labs-dev \
    --name=meme-generator.scaleops-labs.dev. --type=A --ttl=300 <OLD_IP>
  gcloud dns record-sets transaction add --zone=scaleops-labs-dev \
    --name=meme-generator.scaleops-labs.dev. --type=A --ttl=300 <NEW_LB_IP>
  gcloud dns record-sets transaction execute --zone=scaleops-labs-dev
  ```
- Wait for the managed certificate to become `Active` before flipping the `networking.gke.io/v1beta1.FrontendConfig` back on for HTTPS redirects (initial provisioning can take ~30 minutes).
- Verify HTTP/HTTPS and WebSocket access: `curl -I http://meme-generator.scaleops-labs.dev`, `wscat -c wss://meme-generator.scaleops-labs.dev/ws`.
