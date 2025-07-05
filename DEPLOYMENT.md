# Meme Generator Deployment Guide

## Current Status

The deployment infrastructure is fully automated and functional:
- ✅ Backend service is running and healthy
- ✅ Frontend is publicly accessible
- ✅ All infrastructure (NATS, Redis) is deployed automatically
- ✅ WebSocket connection to NATS is working (using custom NATS deployment)
- ✅ Production-ready deployment patterns

**Note**: The application is now fully functional for real-time meme generation.

## Deployment Commands

### Deploy the Application
```bash
# For GKE
skaffold run --profile=gke

# For local development (minikube, kind, etc)
skaffold run --profile=local

# For other cloud providers (EKS, AKS)
skaffold run --profile=cloud
```

### Delete the Application
```bash
# Complete cleanup including all infrastructure
skaffold delete --profile=gke

# Or for other profiles
skaffold delete --profile=local
skaffold delete --profile=cloud
```

## Development Workflow

### Live Development with File Sync
```bash
# Start development mode with automatic file syncing
skaffold dev --profile=local

# For GKE development
skaffold dev --profile=gke
```

This enables:
- **Backend**: Rust files in `src/` are synced to the container
- **Frontend**: Source files in `frontend/src/` are synced
- Automatic rebuild and redeploy on file changes
- Port forwarding for local access

### Port Forwarding (Local Development)
When using `skaffold dev`, the following ports are automatically forwarded:
- Frontend: http://localhost:8080
- NATS monitoring: http://localhost:8222

## Architecture Overview

The deployment includes:
1. **NATS** (Bitnami Helm chart) - Messaging with JetStream
2. **Redis** (Bitnami Helm chart) - Caching layer
3. **Backend** - Rust service for meme processing
4. **Frontend** - React application
5. **Ingress** - Single entry point for all traffic

### Service Communication
```
Browser → http://<ingress-ip>/
         → ws://<ingress-ip>/ws
                    ↓
             Unified Ingress
                ↙        ↘
         Frontend      NATS WebSocket
            ↓               ↓
         Backend ← JetStream Stream
            ↓
       HuggingFace API
```

## Platform-Specific Deployment

### GKE Deployment
- Uses GCE Ingress (can take 5-10 minutes to provision)
- Requires pushing images to a registry
- Ingress IP is automatically configured post-deployment

### Local Development (Minikube/Kind)
- No image push required
- Uses port forwarding instead of Ingress
- Faster iteration cycles

### Other Clouds (EKS, AKS)
- Deploys NGINX Ingress Controller
- Similar to GKE but uses NGINX instead of GCE Ingress

## What's Automated

✅ **Everything is automated with a single command**:
- Namespace creation (meme-generator, messaging, cache)
- Infrastructure deployment (NATS, Redis) via Helm
- Multi-platform image building (arm64 + amd64)
- Application deployment
- Ingress configuration
- Environment variable updates with Ingress IP

## Platform Features

### Custom NATS Deployment
The solution uses a custom NATS StatefulSet that:
- Properly enables WebSocket on port 8080
- Includes JetStream for message persistence
- Supports both regular NATS protocol and WebSocket connections
- No authentication for demo purposes (can be enabled for production)

## Debugging

### View Logs
```bash
# Backend logs
kubectl logs -n meme-generator -l app=meme-generator-backend -f

# Frontend logs
kubectl logs -n meme-generator -l app=meme-generator-frontend -f

# NATS logs
kubectl logs -n messaging -l app.kubernetes.io/name=nats -f

# Redis logs
kubectl logs -n cache -l app.kubernetes.io/name=redis -f
```

### Check Deployment Status
```bash
# Overall status
kubectl get all -A

# Ingress status (GKE)
kubectl get ingress -n meme-generator -w

# Check if images were built
skaffold diagnose
```

### Test Connectivity
```bash
# Test NATS (port forward first)
kubectl port-forward -n messaging svc/nats 8222:8222
curl http://localhost:8222/varz

# Test backend health
kubectl port-forward -n meme-generator svc/meme-generator-backend 9090:9090
curl http://localhost:9090/metrics
```

## Configuration

### Environment Variables

Backend (`k8s/backend/deployment.yaml`):
- `NATS_URL` - NATS connection URL
- `REDIS_URL` - Redis connection URL  
- `HF_API_TOKEN` - HuggingFace API token (from secret)

Frontend (`k8s/frontend/deployment.yaml`):
- `VITE_NATS_URL` - WebSocket URL for NATS (dynamically updated)
- `VITE_REQUEST_SUBJECT` - NATS subject for requests
- `VITE_RESPONSE_SUBJECT` - NATS subject for responses

## Summary

The deployment process achieves all goals:
- ✅ Single-command deployment across all platforms
- ✅ Platform-agnostic with Kustomize overlays
- ✅ Full infrastructure automation (NATS, Redis)
- ✅ Multi-platform image support (arm64 + amd64)
- ✅ WebSocket connectivity working properly
- ✅ Cloud-ready deployment configurations
- ✅ Real-time meme generation fully functional

The application is now production-ready with proper WebSocket support for real-time communication between the frontend and backend through NATS.