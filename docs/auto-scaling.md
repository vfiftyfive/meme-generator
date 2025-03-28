# Auto-Scaling Guide for Meme Generator

This guide explains the auto-scaling configuration for the Meme Generator application and how to test each auto-scaling component.

## Auto-Scaling Strategy Overview

The Meme Generator application uses three different auto-scaling approaches:

1. **Frontend (HPA)**: Horizontal Pod Autoscaler based on CPU and memory metrics
2. **Backend (KEDA)**: Event-driven auto-scaling based on NATS message queue depth
3. **Redis (VPA)**: Vertical Pod Autoscaler for automatic resource adjustment

## Frontend Auto-Scaling (HPA)

### Configuration

The frontend uses a Horizontal Pod Autoscaler (HPA) with the following configuration:

```yaml
# k8s/frontend/hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: meme-generator-frontend-hpa
  namespace: meme-generator
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: meme-generator-frontend
  minReplicas: 1
  maxReplicas: 5
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 30  # Very sensitive threshold
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 50
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 0  # Scale up immediately
      policies:
      - type: Percent
        value: 100
        periodSeconds: 15
    scaleDown:
      stabilizationWindowSeconds: 300  # Wait 5 minutes before scaling down
      policies:
      - type: Percent
        value: 20
        periodSeconds: 60
```

### Resource Configuration

The frontend deployment has very low resource requests to make the HPA more sensitive:

```yaml
# k8s/frontend/deployment.yaml (resource section)
resources:
  requests:
    cpu: 10m
    memory: 64Mi
  limits:
    cpu: 100m
    memory: 128Mi
```

## Backend Auto-Scaling (KEDA)

### Configuration

The backend uses KEDA for event-driven auto-scaling based on NATS message queue depth:

```yaml
# k8s/backend/keda-scaledobject.yaml
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: meme-generator-backend-scaler
  namespace: meme-generator
spec:
  scaleTargetRef:
    name: meme-generator
  minReplicaCount: 0  # Can scale to zero when no messages
  maxReplicaCount: 10
  pollingInterval: 5  # Check every 5 seconds
  cooldownPeriod: 30  # Scale down after 30 seconds of no triggers
  triggers:
  - type: nats-jetstream
    metadata:
      natsServerMonitoringEndpoint: "nats.messaging.svc.cluster.local:8222"
      stream: "MEMES"
      consumer: "meme-generator"
      account: "$G"
      lagThreshold: "5"  # Scale up when 5 messages are pending
      activationLagThreshold: "1"  # Activate at 1 message
      useHttps: "false"
```

### Resource Configuration

The backend deployment has low resource requests to ensure efficient scaling:

```yaml
# k8s/backend/deployment.yaml (resource section)
resources:
  requests:
    cpu: 50m
    memory: 64Mi
  limits:
    cpu: 500m
    memory: 256Mi
```

## Redis Auto-Scaling (VPA)

### Configuration

Redis uses a Vertical Pod Autoscaler (VPA) for automatic resource adjustment:

```yaml
# k8s/redis/vpa.yaml
apiVersion: autoscaling.k8s.io/v1
kind: VerticalPodAutoscaler
metadata:
  name: redis-vpa
  namespace: cache
spec:
  targetRef:
    apiVersion: "redis.redis.opstreelabs.in/v1beta2"
    kind: Redis
    name: redis
  updatePolicy:
    updateMode: "Auto"
  resourcePolicy:
    containerPolicies:
    - containerName: "*"
      minAllowed:
        cpu: 50m
        memory: 64Mi
      maxAllowed:
        cpu: 1000m
        memory: 1Gi
      controlledResources: ["cpu", "memory"]
```

## Deploying the Auto-Scaling Components

### Prerequisites

Ensure you have the following components installed in your Kubernetes cluster:
- Metrics Server (for HPA)
- Vertical Pod Autoscaler Operator
- KEDA Operator

### Deployment Steps

1. **Apply Namespace Configurations**:
   ```bash
   kubectl apply -f k8s/namespace.yaml
   kubectl apply -f k8s/messaging-namespace.yaml
   kubectl apply -f k8s/cache-namespace.yaml
   ```

2. **Deploy NATS with JetStream**:
   ```bash
   helm repo add nats https://nats-io.github.io/k8s/helm/charts/
   helm repo update
   helm install nats nats/nats -n messaging -f k8s/nats/values.yaml
   ```

3. **Deploy Redis with VPA**:
   ```bash
   helm repo add ot-helm https://ot-container-kit.github.io/helm-charts/
   helm repo update
   helm install redis-operator ot-helm/redis-operator -n cache -f k8s/redis/operator-values.yaml
   kubectl apply -f k8s/redis/instance.yaml
   kubectl apply -f k8s/redis/vpa.yaml
   ```

4. **Deploy Backend with KEDA**:
   ```bash
   kubectl apply -f k8s/backend/deployment.yaml
   kubectl apply -f k8s/backend/service.yaml
   kubectl apply -f k8s/backend/keda-scaledobject.yaml
   ```

5. **Deploy Frontend with HPA**:
   ```bash
   kubectl apply -f k8s/frontend/deployment.yaml
   kubectl apply -f k8s/frontend/service.yaml
   kubectl apply -f k8s/frontend/hpa.yaml
   ```

6. **Deploy Prometheus for Monitoring**:
   ```bash
   helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
   helm repo update
   helm install prometheus prometheus-community/kube-prometheus-stack -n monitoring -f k8s/monitoring/prometheus-values.yaml
   ```

## Testing Auto-Scaling

### Testing Frontend HPA

1. **Access the Frontend**:
   ```bash
   kubectl port-forward svc/meme-generator-frontend -n meme-generator 8080:80
   ```
   Then open http://localhost:8080 in your browser.

2. **Generate Load**:
   You can use one of these methods to generate load:

   **Method 1: Load Testing Tool**
   ```bash
   # Install hey if needed: brew install hey
   hey -z 5m -c 50 http://localhost:8080/
   ```

   **Method 2: In-Pod CPU Load**
   ```bash
   # Get the pod name
   FRONTEND_POD=$(kubectl get pods -n meme-generator -l app=meme-generator-frontend -o jsonpath='{.items[0].metadata.name}')
   
   # Generate CPU load
   kubectl exec -it $FRONTEND_POD -n meme-generator -- sh -c "while true; do :; done"
   ```

3. **Monitor HPA**:
   ```bash
   kubectl get hpa -n meme-generator -w
   ```

   In another terminal, check pod metrics:
   ```bash
   kubectl top pods -n meme-generator
   ```

### Testing Backend KEDA

1. **Generate Message Queue Load**:
   The easiest way is to generate multiple memes through the frontend UI.
   
   Alternatively, you can publish messages directly to NATS:
   ```bash
   # Port-forward NATS service
   kubectl port-forward svc/nats -n messaging 4222:4222
   
   # Install NATS CLI if needed
   brew install nats-io/nats-tools/nats
   
   # Publish test messages
   for i in {1..20}; do
     echo "{\"prompt\":\"Test meme $i\",\"fastMode\":true}" | nats pub meme.request -s nats://localhost:4222
     sleep 0.5
   done
   ```

2. **Monitor KEDA Scaling**:
   ```bash
   kubectl get scaledobject -n meme-generator
   kubectl get pods -n meme-generator -w
   ```

3. **Check NATS Queue**:
   ```bash
   kubectl port-forward svc/nats -n messaging 8222:8222
   ```
   Then open http://localhost:8222/jsz in your browser to see JetStream stats.

### Testing Redis VPA

VPA operates over longer time periods, so you'll need to:

1. **Generate Redis Load**:
   ```bash
   # Port-forward Redis service
   kubectl port-forward svc/redis -n cache 6379:6379
   
   # Run Redis benchmark
   redis-benchmark -h localhost -p 6379 -n 100000 -c 50
   ```

2. **Monitor VPA Recommendations**:
   ```bash
   kubectl describe vpa redis-vpa -n cache
   ```

3. **Check Resource Usage**:
   ```bash
   kubectl top pods -n cache
   ```

## Monitoring with Prometheus and Grafana

1. **Access Prometheus**:
   ```bash
   kubectl port-forward -n monitoring svc/prometheus-kube-prometheus-prometheus 9090:9090
   ```
   Then open http://localhost:9090 in your browser.

2. **Access Grafana**:
   ```bash
   kubectl port-forward -n monitoring svc/prometheus-grafana 3000:80
   ```
   Then open http://localhost:3000 in your browser and log in with:
   - Username: admin
   - Password: meme-battle

3. **Useful Metrics to Monitor**:
   - HPA metrics: `kube_horizontalpodautoscaler_status_*`
   - Pod metrics: `container_cpu_usage_seconds_total`, `container_memory_usage_bytes`
   - NATS metrics: `nats_jetstream_consumer_*`, `nats_jetstream_stream_*`
   - Redis metrics: `redis_memory_used_bytes`, `redis_cpu_sys_seconds_total`

## Troubleshooting

### HPA Issues

- **HPA not scaling**: Check if metrics-server is working properly:
  ```bash
  kubectl get apiservice v1beta1.metrics.k8s.io
  ```

- **No metrics available**: Check if pods have resource requests set:
  ```bash
  kubectl describe hpa -n meme-generator
  ```

### KEDA Issues

- **KEDA not scaling**: Check if KEDA can access NATS monitoring endpoint:
  ```bash
  kubectl logs -n keda -l app=keda-operator
  ```

- **NATS connection issues**: Verify NATS monitoring endpoint is accessible:
  ```bash
  kubectl port-forward svc/nats -n messaging 8222:8222
  curl http://localhost:8222/jsz
  ```

### VPA Issues

- **VPA not making recommendations**: VPA needs time to gather usage data:
  ```bash
  kubectl describe vpa redis-vpa -n cache
  ```

- **Pod not restarting with new resources**: Check VPA update mode:
  ```bash
  kubectl get vpa redis-vpa -n cache -o yaml | grep updateMode
  ```
