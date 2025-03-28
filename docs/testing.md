# Testing Guide for Meme Generator

This guide provides step-by-step instructions for testing the Meme Generator application and verifying that the auto-scaling features are working correctly.

## Prerequisites

Before starting, ensure you have:
- A running Kubernetes cluster with all required operators installed
- The meme generator application deployed according to the setup guide
- kubectl installed and configured to access your cluster

## Testing Workflow

We'll test each component of the application to verify functionality and auto-scaling:

1. Basic application functionality
2. Frontend HPA auto-scaling
3. Backend KEDA auto-scaling
4. Redis VPA auto-scaling

## 1. Basic Application Functionality

### Access the Application

```bash
# Port-forward the frontend service
kubectl port-forward svc/meme-generator-frontend -n meme-generator 8080:80
```

Open your browser and navigate to http://localhost:8080

### Generate Your First Meme

1. Enter a prompt in the text field (e.g., "A cat wearing sunglasses")
2. Toggle options if desired:
   - Fast Mode: Uses a faster but less detailed model
   - Small Image: Generates a smaller image size
3. Click "Generate Meme"
4. Wait for the meme to be generated and displayed

### Verify Backend Processing

```bash
# Check backend logs
kubectl logs -n meme-generator -l app=meme-generator
```

You should see log entries showing the request being processed.

## 2. Testing Frontend HPA

### Monitor Initial State

```bash
# Check current HPA status
kubectl get hpa -n meme-generator

# Check current frontend pods
kubectl get pods -n meme-generator -l app=meme-generator-frontend
```

Note the current number of replicas and CPU/memory utilization.

### Generate Load

#### Option 1: Using a Load Testing Tool

```bash
# Install hey if needed
# brew install hey

# Generate load (50 concurrent users for 5 minutes)
hey -z 5m -c 50 http://localhost:8080/
```

#### Option 2: Using In-Pod CPU Load

```bash
# Get the frontend pod name
FRONTEND_POD=$(kubectl get pods -n meme-generator -l app=meme-generator-frontend -o jsonpath='{.items[0].metadata.name}')

# Generate CPU load
kubectl exec -it $FRONTEND_POD -n meme-generator -- sh -c "while true; do :; done"
```

### Monitor Scaling

In a separate terminal, watch the HPA and pods:

```bash
# Watch HPA status
kubectl get hpa -n meme-generator -w

# In another terminal, watch pods
kubectl get pods -n meme-generator -w

# In another terminal, monitor CPU usage
kubectl top pods -n meme-generator
```

You should observe:
1. CPU utilization increasing
2. HPA status showing the desire to scale
3. New pods being created
4. Load being distributed across pods

### Stop Load Generation

If you're using the in-pod CPU load method, press Ctrl+C to stop the load.

Wait for the stabilization period (5 minutes) and observe the pods scaling back down.

## 3. Testing Backend KEDA

### Monitor Initial State

```bash
# Check current KEDA ScaledObject
kubectl get scaledobject -n meme-generator

# Check current backend pods
kubectl get pods -n meme-generator -l app=meme-generator
```

Note the current number of replicas.

### Generate Message Queue Load

#### Option 1: Using the Frontend UI

1. Open multiple browser tabs to http://localhost:8080
2. Generate multiple memes in quick succession (at least 10)

#### Option 2: Using Direct NATS Publishing

```bash
# Port-forward NATS service
kubectl port-forward svc/nats -n messaging 4222:4222

# Install NATS CLI if needed
# brew install nats-io/nats-tools/nats

# Publish test messages
for i in {1..20}; do
  echo "{\"prompt\":\"Test meme $i\",\"fastMode\":true}" | nats pub meme.request -s nats://localhost:4222
  sleep 0.5
done
```

### Monitor NATS Queue and Scaling

```bash
# Port-forward NATS monitoring
kubectl port-forward svc/nats -n messaging 8222:8222

# In another terminal, watch backend pods
kubectl get pods -n meme-generator -l app=meme-generator -w
```

Open http://localhost:8222/jsz in your browser to see JetStream stats.

You should observe:
1. Messages accumulating in the queue
2. New backend pods being created
3. Messages being processed
4. Pods scaling back down when the queue is empty

## 4. Testing Redis VPA

VPA operates over longer time periods, so this test requires patience.

### Monitor Initial State

```bash
# Check current VPA
kubectl get vpa -n cache

# Check current Redis resources
kubectl describe pod -n cache -l redis.redis.opstreelabs.in/name=redis
```

Note the current resource requests and limits.

### Generate Redis Load

```bash
# Port-forward Redis service
kubectl port-forward svc/redis -n cache 6379:6379

# Run Redis benchmark
redis-benchmark -h localhost -p 6379 -n 100000 -c 50 -t set,get -d 1024
```

### Monitor VPA Recommendations

```bash
# Check VPA recommendations
kubectl describe vpa redis-vpa -n cache
```

Look for the "recommendation" section in the output.

### Observe Resource Changes

VPA may take hours to apply changes. To see if changes have been applied:

```bash
# Check if pod was restarted with new resources
kubectl get pods -n cache -l redis.redis.opstreelabs.in/name=redis
kubectl describe pod -n cache -l redis.redis.opstreelabs.in/name=redis
```

Compare the resource requests and limits with the initial state.

## 5. Monitoring with Prometheus and Grafana

### Access Prometheus

```bash
kubectl port-forward -n monitoring svc/prometheus-kube-prometheus-prometheus 9090:9090
```

Open http://localhost:9090 in your browser.

Try these example queries:
- `kube_horizontalpodautoscaler_status_current_replicas{namespace="meme-generator"}`
- `container_cpu_usage_seconds_total{namespace="meme-generator"}`

### Access Grafana

```bash
kubectl port-forward -n monitoring svc/prometheus-grafana 3000:80
```

Open http://localhost:3000 in your browser and log in with:
- Username: admin
- Password: meme-battle

Navigate to Dashboards and look for Kubernetes-related dashboards.

## Troubleshooting

### Application Issues

- **Frontend not loading**: Check frontend pod logs
  ```bash
  kubectl logs -n meme-generator -l app=meme-generator-frontend
  ```

- **Meme generation failing**: Check backend pod logs
  ```bash
  kubectl logs -n meme-generator -l app=meme-generator
  ```

### Auto-scaling Issues

- **HPA not scaling**: Check metrics-server and HPA events
  ```bash
  kubectl describe hpa -n meme-generator
  ```

- **KEDA not scaling**: Check KEDA logs and NATS connectivity
  ```bash
  kubectl logs -n keda -l app=keda-operator
  ```

- **VPA not adjusting resources**: VPA operates conservatively; check recommendations
  ```bash
  kubectl describe vpa redis-vpa -n cache
  ```

## Cleanup

When you're done testing, you can clean up resources:

```bash
# Stop any port-forwarding processes (Ctrl+C)

# Scale down deployments
kubectl scale deployment meme-generator-frontend -n meme-generator --replicas=1
kubectl scale deployment meme-generator -n meme-generator --replicas=1
```
