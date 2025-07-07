# ScaleOps-Focused Testing Guide

## Overview

This guide focuses on testing components that ScaleOps controls and optimizes:
- **HPA behavior** (enhanced scaling decisions)
- **Node autoscaling** (bin-packing with optimize-utilization)
- **Resource optimization** (right-sizing recommendations)
- **Cost vs Performance** trade-offs

## Quick Start

```bash
# Run ScaleOps validation test
./test-scaleops.sh
# Choose option 1 for HPA test

# In another terminal, monitor ScaleOps behavior
./scaleops-monitor.sh --watch
```

## What ScaleOps Controls

### 1. HPA Enhancement
ScaleOps doesn't replace HPA but enhances it with:
- Predictive scaling based on patterns
- Cost-aware scaling decisions
- Performance optimization
- Prevents thrashing

### 2. Node Autoscaling
With `optimize-utilization` profile:
- Aggressive bin-packing
- Faster scale-down (10 min idle)
- Prefers fewer, fuller nodes
- Spot instance awareness

### 3. Resource Recommendations
- Right-sizing based on actual usage
- VPA-like recommendations
- Memory vs CPU optimization

## Test Scenarios

### 1. HPA Optimization Test (`scaleops-hpa-test.js`)
**Purpose**: Validate ScaleOps HPA enhancements
```bash
k6 run k6/scenarios/scaleops-hpa-test.js
```
- Tests gradual load increase
- Burst patterns for predictive scaling
- Resource-based scaling decisions

### 2. Node Packing Test (`scaleops-node-packing.js`)
**Purpose**: Validate bin-packing efficiency
```bash
k6 run k6/scenarios/scaleops-node-packing.js
```
- Creates pods with different resource needs
- Tests placement optimization
- Validates aggressive scale-down

### 3. Simple Load Test (`scaleops-simple-load.js`)
**Purpose**: Basic HPA trigger validation
```bash
k6 run k6/scenarios/scaleops-simple-load.js
```
- HTTP load to trigger CPU-based scaling
- Clear scaling thresholds
- Easy to monitor

## Monitoring ScaleOps Behavior

### During Tests
```bash
# ScaleOps-specific monitor
./scaleops-monitor.sh --watch

# Watch HPA decisions
kubectl get hpa -n meme-generator --watch

# Watch node scaling
kubectl get nodes --watch

# ScaleOps recommendations
kubectl get recommendations -n meme-generator
```

### Key Metrics to Observe

1. **HPA Scaling Speed**
   - Time from threshold breach to scale decision
   - ScaleOps may delay/accelerate based on patterns

2. **Pod Placement**
   ```bash
   kubectl get pods -n meme-generator -o wide
   ```
   - Should see tight packing on nodes
   - Minimal node sprawl

3. **Node Utilization**
   ```bash
   kubectl top nodes
   ```
   - Should see high utilization before new node
   - Quick scale-down when underutilized

4. **ScaleOps Policies**
   ```bash
   kubectl get hpapolicies.analysis.scaleops.sh -n scaleops-system
   ```
   - cost, performance, predictive, production

## Expected Results

### Without ScaleOps
- Linear HPA scaling at thresholds
- Conservative node scaling
- Balanced pod distribution

### With ScaleOps
- Intelligent scaling decisions
- Tighter node packing
- Predictive pre-scaling
- Cost optimization

## Test Validation Checklist

- [ ] HPA scales at expected thresholds
- [ ] ScaleOps recommendations appear
- [ ] Nodes pack efficiently (>70% utilization)
- [ ] Scale-down happens within 10-15 minutes
- [ ] No unnecessary scaling thrashing
- [ ] Pod placement optimizes for bin-packing

## Troubleshooting

### HPA Not Scaling
```bash
# Check metrics
kubectl top pods -n meme-generator

# Check HPA status
kubectl describe hpa -n meme-generator

# Check ScaleOps policies
kubectl logs -n scaleops-system -l app=scaleops-controller
```

### Nodes Not Packing Efficiently
- Verify optimize-utilization is set
- Check pod anti-affinity rules
- Review resource requests/limits

### No ScaleOps Recommendations
- Ensure ScaleOps controller is running
- Check if workload has been running long enough
- Verify ScaleOps has permissions

## Cost Analysis

After testing, evaluate:
1. Node hours used
2. Average node utilization
3. Over-provisioning percentage
4. Potential savings with ScaleOps

```bash
# Example: Calculate node efficiency
kubectl top nodes --no-headers | awk '{sum+=$3; count++} END {print "Avg CPU:", sum/count "%"}'
```