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
1. Install the Vertical Pod Autoscaler components:
   ```bash
   kubectl apply -f https://github.com/kubernetes/autoscaler/releases/download/vpa-release-0.14.0/vpa-crd.yaml
   kubectl apply -f https://github.com/kubernetes/autoscaler/releases/download/vpa-release-0.14.0/vpa-rbac.yaml
   kubectl apply -f https://github.com/kubernetes/autoscaler/releases/download/vpa-release-0.14.0/vpa-deployment.yaml
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
