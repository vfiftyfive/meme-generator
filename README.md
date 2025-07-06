# 🎭 Meme Generator

A production-ready Kubernetes application demonstrating modern cloud-native deployment practices with auto-scaling, multi-platform support, and real-time messaging.

## 🚀 Quick Start

Deploy the entire application with a single command:

```bash
# Deploy locally  
skaffold run --profile=local

# Deploy to GKE
skaffold run --profile=gke

# Deploy locally (minikube/kind)
skaffold run --profile=local
```

## 📋 Project Overview

This application demonstrates:
- **Real-time WebSocket communication** via NATS JetStream
- **Multi-platform deployment** (local, GKE, EKS, AKS)
- **Auto-scaling** with HPA, VPA, and KEDA
- **Platform-agnostic infrastructure** using Kustomize overlays
- **Single-command deployment** with Skaffold
- **Production-ready** deployment patterns

## 🏗️ Architecture

### System Components

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│                 │     │                 │     │                 │
│    Frontend     │────▶│   NATS with    │────▶│    Backend      │
│   (React/TS)    │◀────│   WebSocket    │◀────│  (Rust/Tokio)   │
│                 │     │                 │     │                 │
└─────────────────┘     └─────────────────┘     └────────┬────────┘
                                                          │
                              ┌─────────────────┐         │
                              │                 │         │
                              │      Redis      │◀────────┘
                              │   (Caching)     │
                              │                 │
                              └─────────────────┘
```

### Message Flow

1. **User** submits meme request via web interface
2. **Frontend** sends message to NATS via WebSocket
3. **NATS JetStream** persists message and delivers to backend
4. **Backend** processes request:
   - Checks Redis cache
   - Calls HuggingFace API if not cached
   - Stores result in Redis
   - Sends response back via NATS
5. **Frontend** receives and displays generated meme

### Key Technologies

- **Frontend**: React, TypeScript, Material-UI, Vite
- **Backend**: Rust, Tokio, async-nats
- **Messaging**: NATS with JetStream and WebSocket support
- **Caching**: Redis (Bitnami Helm chart)
- **Deployment**: Skaffold, Kustomize, Helm
- **Ingress**: Kubernetes Ingress (platform-specific)
- **Container Runtime**: Multi-platform images (ARM64 + AMD64)

## 📁 Repository Structure

```
meme-generator/
├── k8s/                       # Kubernetes configurations
│   ├── base/                  # Base resources (deployments, services)
│   │   ├── namespaces.yaml    # All namespace definitions
│   │   ├── backend-deployment.yaml
│   │   ├── frontend-deployment.yaml
│   │   └── ingress.yaml
│   ├── overlays/              # Platform-specific configurations
│   │   ├── local/             # Local development settings
│   │   ├── gke/               # Google Kubernetes Engine
│   │   ├── cloud/             # Generic cloud (EKS, AKS)
│   ├── nats/                  # NATS configuration
│   │   └── nats-simple.yaml   # Custom NATS with WebSocket
│   └── infrastructure.yaml    # Complete infrastructure setup
├── services/
│   ├── backend/               # Rust backend service
│   └── frontend/              # React frontend application
├── skaffold.yaml              # Deployment orchestration
└── DEPLOYMENT.md              # Detailed deployment guide
```

## 🚀 Deployment Guide

### Prerequisites

1. **Kubernetes Cluster**
   - Local: Docker Desktop, minikube, or kind
   - Cloud: GKE, EKS, or AKS cluster
   
2. **Required Tools**
   ```bash
   # Install Skaffold
   curl -Lo skaffold https://storage.googleapis.com/skaffold/releases/latest/skaffold-linux-amd64
   sudo install skaffold /usr/local/bin/
   
   # Install kubectl (if not already installed)
   curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
   sudo install kubectl /usr/local/bin/
   ```

### Deployment Profiles

#### 1. Local Development
```bash
# Deploy locally (no image push required)
skaffold run --profile=local

# Development mode with hot reload
skaffold dev --profile=local
```

#### 2. Google Kubernetes Engine (GKE)

**Option A: With Custom Domain (Recommended)**
```bash
# First, set up external-dns (one-time setup)
export GCP_PROJECT_ID="your-project-id"
export DOMAIN="yourdomain.com"
export CLUSTER_NAME="your-cluster-name"
cd k8s/external-dns && ./setup.sh

# Deploy with your domain
DOMAIN=yourdomain.com skaffold run --profile=gke

# Access at: https://meme.yourdomain.com
```

**Option B: IP-only Access**
```bash
# Deploy without domain
skaffold run --profile=gke

# Uses GCE Ingress (takes 5-10 minutes to provision)
# Access via the IP address shown in output
```

#### 4. Other Cloud Providers (EKS/AKS)
```bash
# Deploy with NGINX Ingress
skaffold run --profile=cloud
```

### Clean Up
```bash
# Delete all resources
skaffold delete --profile=<profile-name>
```

## 🔧 Configuration

### Infrastructure Management with Pulumi

The application uses Pulumi for infrastructure as code, managing DNS and GCP resources:

1. **Quick Setup**:
   ```bash
   cd infrastructure/pulumi
   ./setup.sh
   pulumi up
   ```

2. **What Pulumi Manages**:
   - Google Cloud DNS zone and records
   - Static IP for ingress
   - Service accounts and IAM permissions
   - external-dns deployment and configuration
   - Workload Identity bindings

3. **Deploy with Domain**:
   ```bash
   # After Pulumi setup
   DOMAIN=scaleops-labs.dev skaffold run --profile=gke
   
   # Access at: https://meme-generator.scaleops-labs.dev
   ```

4. **Full Guide**: See `infrastructure/SETUP_GUIDE.md` for detailed instructions

### Environment Variables

**Backend** (`HF_API_TOKEN` required):
```bash
# Create secret for HuggingFace API token
kubectl create secret generic meme-generator-secrets \
  -n meme-generator \
  --from-literal=HF_API_TOKEN=your-token-here
```

**Frontend** (automatically configured):
- `VITE_NATS_URL`: WebSocket URL (dynamically set based on deployment)
- `VITE_REQUEST_SUBJECT`: `meme.request`
- `VITE_RESPONSE_SUBJECT`: `meme.response`

## 🏗️ How It Works

### 1. Infrastructure Deployment

The deployment process ensures proper ordering:

1. **Namespaces** are created first
2. **NATS** is deployed with WebSocket enabled
3. **Redis** is deployed via Helm
4. **Application** components are deployed
5. **Init containers** ensure dependencies are ready

### 2. Init Containers

The backend uses init containers to wait for dependencies:

```yaml
initContainers:
  - name: wait-for-nats
    image: busybox:1.36
    command: ['sh', '-c', 'until nc -z nats.messaging.svc.cluster.local 4222; do sleep 2; done']
  - name: wait-for-redis
    image: busybox:1.36
    command: ['sh', '-c', 'until nc -z redis-master.cache.svc.cluster.local 6379; do sleep 2; done']
```

### 3. WebSocket Configuration

NATS is configured with WebSocket support:

```yaml
websocket {
  port: 8080
  no_tls: true
}
```

The frontend connects via WebSocket through the Ingress at `/ws` path.

### 4. Auto-scaling

- **Frontend (HPA)**: Scales based on CPU/memory (30%/50% thresholds)
- **Backend (KEDA)**: Scales based on NATS queue depth (5+ messages)
- **Redis (VPA)**: Automatically adjusts resources based on usage

## 🐛 Troubleshooting

### Common Issues

1. **Backend CrashLoopBackOff**
   - Check NATS is running: `kubectl get pods -n messaging`
   - Check Redis is running: `kubectl get pods -n cache`
   - View logs: `kubectl logs -n meme-generator deploy/meme-backend`

2. **WebSocket Connection Failed**
   - Verify NATS has WebSocket enabled: `kubectl get svc -n messaging`
   - Check ingress configuration: `kubectl get ingress -A`

3. **Image Pull Errors**
   - For cloud profiles: Ensure Docker Hub login
   - For local profile: Images should be available locally

4. **Namespace Terminating**
   ```bash
   # Force delete stuck namespace
   kubectl delete namespace <name> --force --grace-period=0
   ```

### Debugging Commands

```bash
# Check all pods
kubectl get pods -A | grep -E "(meme|nats|redis)"

# View backend logs
kubectl logs -n meme-generator -l app=meme-backend -f

# Check NATS connectivity
kubectl port-forward -n messaging svc/nats 8222:8222
curl http://localhost:8222/varz

# Test WebSocket locally
kubectl port-forward -n messaging svc/nats-websocket 8090:8080
# Open test-ws-final.html in browser
```

## 📈 Load Testing

Test auto-scaling behavior:

```bash
# Generate load on frontend (HPA test)
kubectl run -i --tty load-generator --rm --image=busybox --restart=Never -- /bin/sh -c "while sleep 0.01; do wget -q -O- http://meme-generator-frontend.meme-generator/; done"

# Generate messages for backend (KEDA test)
cd stress/
npm install
npm run stress -- --messages 100 --concurrent 10
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test with `skaffold dev`
5. Submit a pull request

## 📝 License

MIT License - see LICENSE file for details

## 🆘 Support

- GitHub Issues: Report bugs or request features
- Documentation: Check `/docs` folder for detailed guides
- Examples: See `/stress` folder for testing examples