# k6 Load Testing Guide for Meme Generator

## Overview

This directory contains k6 load testing scenarios designed to validate the autoscaling capabilities of the meme-generator application on GKE.

## Architecture Under Test

```
Internet → Cloud LB → Ingress → Frontend (HPA: 1-5) → WebSocket → Backend (HPA: 1-10)
                                     ↓                                  ↓
                                   Static Assets                    Redis Cache
                                                                   NATS Queue
```

## Prerequisites

1. **Install k6**:
   ```bash
   # macOS
   brew install k6
   
   # Linux
   sudo apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
   echo "deb https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
   sudo apt-get update
   sudo apt-get install k6
   ```

2. **Verify cluster access**:
   ```bash
   kubectl get nodes
   kubectl get hpa -n meme-generator
   ```

## Test Scenarios

| Test | Duration | VUs | Purpose | Expected Outcome |
|------|----------|-----|---------|------------------|
| **Smoke** | 5 min | 3 | Baseline validation | System works, <1s response |
| **Load** | 30 min | 50 | Normal traffic | Frontend: 2-3 pods, Backend: 3-5 pods |
| **Demo Load** | 6 min | 40 | Autoscaler conflict rehearsal | Quick Grafana snapshots, baseline conflict |
| **Stress** | 20 min | 200 | Find limits | Max scaling, identify bottlenecks |
| **Spike** | 15 min | 10→150→10 | Rapid scaling | HPA reacts <60s, no errors |
| **Soak** | 2 hours | 30 | Stability | No memory leaks, stable performance |

## Quick Start

### Run a single test:
```bash
# Set target URL (if not using default)
export BASE_URL=http://meme-generator.scaleops-labs.dev

# Run smoke test
k6 run scenarios/1-smoke.js

# Run load test with monitoring
./monitor-scaling.sh --watch &  # In another terminal
k6 run scenarios/2-load.js

# Run quick demo load (autoscaler conflict warmup)
k6 run scenarios/2-load-demo.js
```

### Use the test runner:
```bash
./run-tests.sh
# Select option 2 for load test
```

## Real-time Monitoring

### During tests, monitor in separate terminals:

```bash
# Terminal 1: HPA Status
watch -n 2 'kubectl get hpa -n meme-generator'

# Terminal 2: Pod scaling
watch -n 2 'kubectl get pods -n meme-generator'

# Terminal 3: Node resources
watch -n 5 'kubectl top nodes'

# Or use our all-in-one monitor:
./monitor-scaling.sh --watch
```

## Interpreting Results

### HPA Scaling Indicators:
```
NAME                      REFERENCE                            TARGETS         MINPODS   MAXPODS   REPLICAS
meme-generator-frontend   Deployment/meme-generator-frontend   cpu: 45%/30%    1         5         3
meme-backend              Deployment/meme-backend              cpu: 65%/50%    1         10        7
```
- **TARGETS**: Current/Target usage (scaling triggers when current > target)
- **REPLICAS**: Current pod count

### k6 Metrics to Watch:
- **http_req_duration**: Response times (p95 < 3s is good)
- **http_req_failed**: Error rate (< 5% is acceptable)
- **ws_connecting**: WebSocket connection time
- **vus**: Active virtual users

### Expected Scaling Behavior:

1. **Frontend Scaling** (CPU > 30%):
   - First scale at ~15-20 concurrent users
   - Linear scaling up to 5 pods
   - Each pod handles ~10-15 concurrent users

2. **Backend Scaling** (CPU > 50%):
   - First scale at ~10-15 meme generations/min
   - Scales based on processing load
   - Memory usage affects scaling at high loads

3. **Ingress/LB**:
   - GKE ingress auto-scales
   - May see initial latency during provisioning

## Troubleshooting

### Pods not scaling:
```bash
# Check HPA events
kubectl describe hpa meme-generator-frontend -n meme-generator

# Check metrics server
kubectl top pods -n meme-generator

# Check pod resources
kubectl describe pod <pod-name> -n meme-generator
```

### High error rates:
- Check ingress limits
- Verify WebSocket timeout settings
- Review backend logs: `kubectl logs -n meme-generator -l app=meme-backend`

### Slow scaling:
- Review HPA behavior configuration
- Check node autoscaling settings
- Verify no PodDisruptionBudgets blocking

## Integration with ScaleOps

The HPA configurations work with ScaleOps policies:
- **Cost optimization**: May delay scale-up during off-peak
- **Performance mode**: More aggressive scaling
- **Predictive scaling**: Pre-scales based on patterns

Check ScaleOps recommendations:
```bash
kubectl get recommendations -n meme-generator
kubectl get policies.analysis.scaleops.sh -n scaleops-system
```

## Best Practices

1. **Before testing**:
   - Ensure cluster has capacity (3+ nodes recommended)
   - Clear any failed pods
   - Reset HPAs if needed: `kubectl delete hpa --all -n meme-generator && kubectl apply -k k8s/overlays/gke`

2. **During testing**:
   - Monitor cluster events: `kubectl get events -n meme-generator --watch`
   - Save results for comparison
   - Document any anomalies

3. **After testing**:
   - Allow cool-down period (5-10 min)
   - Review scaling decisions
   - Check for any resource leaks

## Advanced Testing

### Custom scenarios:
```javascript
// Example: Test Redis pressure
import redis from 'k6/experimental/redis';

const client = redis.connect('redis://redis.cache:6379');

export default function () {
  client.set(`key_${__VU}_${__ITER}`, 'value', 10);
  client.get(`key_${__VU}_${__ITER}`);
}
```

### CI/CD Integration:
```yaml
# .github/workflows/load-test.yml
- name: Run k6 load test
  uses: grafana/k6-action@v0.3.0
  with:
    filename: k6/scenarios/1-smoke.js
    flags: --out json=results.json
```

## Results Analysis

After tests, analyze results:
```bash
# Generate HTML report
k6 inspect results/load.json

# Or use k6 Cloud (requires account)
k6 cloud --project-id=YOUR_PROJECT_ID scenarios/2-load.js
```

Key metrics for capacity planning:
- Requests per second at pod limits
- Memory usage growth over time
- WebSocket connection limits
- Database connection pooling

## Cleanup

After testing:
```bash
# Scale down to save costs
kubectl scale deployment meme-generator-frontend -n meme-generator --replicas=1
kubectl scale deployment meme-backend -n meme-generator --replicas=1

# Verify scale down
kubectl get pods -n meme-generator
```
