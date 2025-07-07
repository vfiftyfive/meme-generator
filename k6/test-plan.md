# k6 Load Testing Plan

## Test Scenarios

### 1. Baseline Test (smoke.js)
- **Duration**: 5 minutes
- **VUs**: 1-5
- **Purpose**: Verify system works under minimal load
- **Targets**: 
  - Response time < 1s
  - Success rate = 100%

### 2. Load Test (load.js)
- **Duration**: 30 minutes
- **VUs**: Ramp up to 50
- **Purpose**: Test normal expected load
- **Targets**:
  - Frontend scales to 2-3 pods
  - Backend scales to 3-5 pods
  - Response time < 3s
  - Success rate > 95%

### 3. Stress Test (stress.js)
- **Duration**: 20 minutes
- **VUs**: Ramp up to 200
- **Purpose**: Find breaking point
- **Targets**:
  - Frontend scales to 5 pods (max)
  - Backend scales to 8-10 pods
  - Identify bottlenecks

### 4. Spike Test (spike.js)
- **Duration**: 15 minutes
- **VUs**: 10 → 150 → 10 (sudden spike)
- **Purpose**: Test rapid scaling
- **Targets**:
  - HPA reacts within 60s
  - No 5xx errors during scale

### 5. Soak Test (soak.js)
- **Duration**: 2 hours
- **VUs**: Constant 30
- **Purpose**: Find memory leaks, resource exhaustion
- **Targets**:
  - Stable memory usage
  - No pod restarts

## User Journey Simulation

```javascript
// Realistic user behavior
1. Load homepage (GET /)
2. Connect WebSocket
3. Generate meme (POST via WS)
4. Poll for result (WS messages)
5. View result (GET /meme/{id})
6. Share/download (GET /api/meme/{id})
```

## Metrics to Collect

### Application Metrics
- Request rate (req/s)
- Response time (p50, p95, p99)
- Error rate
- WebSocket connection time
- Meme generation time

### Infrastructure Metrics
- Pod count (HPA scaling)
- CPU usage per pod
- Memory usage per pod
- Network throughput
- Redis operations/s
- Queue depth (if using NATS)

### Business Metrics
- Successful memes generated
- Time to first meme
- Concurrent users supported