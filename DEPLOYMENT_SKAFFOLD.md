# Meme Generator - Single Command Deployment with Skaffold

This document explains the simplified deployment process for the meme-generator application.

## Architecture Overview

The application consists of:
- **Frontend**: React app that connects to NATS via WebSocket
- **Backend**: Rust service that processes meme generation requests
- **NATS**: Messaging system with JetStream for persistence and WebSocket for browser connections
- **Redis**: Cache for storing generated memes

## Key Points

### Why NO WebSocket Proxy?

The original confusion about needing a NATS WebSocket proxy was unnecessary. Here's why:

1. **Direct Connection**: NATS supports WebSocket natively on port 8080
2. **No CORS Issues**: When properly configured, the browser can connect directly to NATS WebSocket
3. **Simpler Architecture**: One less component to manage and debug

The frontend connects directly to NATS WebSocket:
- Local development: `ws://localhost:8090` (via port-forward)
- GKE/Cloud: `ws://<LoadBalancer-IP>` (via LoadBalancer service)

## Deployment Commands

### Local Development (Minikube, Kind, Docker Desktop)

```bash
# Deploy everything with one command
skaffold run -p local

# Or for continuous development with hot reload
skaffold dev -p local
```

This will:
1. Deploy NATS with JetStream and WebSocket enabled
2. Deploy Redis in standalone mode
3. Build and deploy the backend and frontend
4. Set up port forwarding for easy access

Access the app at: http://localhost:8080

### GKE Deployment

```bash
# Set your default repository (Docker Hub, GCR, etc)
skaffold run -p gke --default-repo=<your-registry>

# Example with Docker Hub
skaffold run -p gke --default-repo=docker.io/yourusername
```

This will:
1. Deploy NATS and Redis via Helm
2. Build and push images to your registry
3. Deploy the application with LoadBalancers
4. Automatically configure the frontend with the NATS WebSocket URL
5. Display the frontend URL when complete

### Generic Cloud Deployment (EKS, AKS, etc)

```bash
skaffold run -p cloud --default-repo=<your-registry>
```

## What Skaffold Does

1. **Infrastructure First**: Deploys NATS and Redis using Helm charts
2. **Builds Images**: Uses Docker with BuildKit for efficient builds
3. **Deploys Application**: Uses Kustomize for configuration management
4. **Post-Deploy Hooks**: Automatically configures WebSocket URLs for cloud deployments
5. **Port Forwarding**: Sets up local access for development

## Configuration Structure

```
k8s/
├── base/                    # Base Kubernetes manifests
│   ├── backend-deployment.yaml
│   ├── backend-service.yaml
│   ├── backend-secret.yaml
│   ├── frontend-deployment.yaml
│   ├── frontend-service.yaml
│   └── namespaces.yaml
├── overlays/
│   ├── local/              # Local development config
│   ├── gke/                # GKE-specific config (LoadBalancers)
│   └── cloud/              # Generic cloud config
├── nats/
│   └── values-simple.yaml  # NATS Helm values
└── redis/
    └── values-simple.yaml  # Redis Helm values
```

## Troubleshooting

### NATS WebSocket Connection Issues

1. Verify NATS has WebSocket enabled:
   ```bash
   kubectl port-forward svc/nats -n messaging 8222:8222
   curl http://localhost:8222/varz | grep websocket
   ```

2. Check if WebSocket port is exposed:
   ```bash
   kubectl get svc nats -n messaging -o yaml | grep -A5 8080
   ```

### Frontend Can't Connect to NATS

1. Check the VITE_NATS_URL environment variable:
   ```bash
   kubectl get deployment meme-generator-frontend -n meme-generator -o jsonpath='{.spec.template.spec.containers[0].env}'
   ```

2. For GKE, ensure LoadBalancer has an IP:
   ```bash
   kubectl get svc nats-websocket-lb -n messaging
   ```

## Clean Up

```bash
# Delete everything
skaffold delete -p <profile-name>

# Or manually
helm uninstall nats -n messaging
helm uninstall redis -n cache
kubectl delete namespace meme-generator messaging cache
```