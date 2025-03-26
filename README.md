# Meme Battle Royale

A Kubernetes demo project to showcase autoscaling with HPA, VPA, and KEDA.

## Project Overview

This monorepo contains all components for the Meme Battle Royale demo, which demonstrates different Kubernetes autoscaling strategies:

- Horizontal Pod Autoscaler (HPA)
- Vertical Pod Autoscaler (VPA)
- Kubernetes Event-Driven Autoscaling (KEDA)

## Repository Structure

```
meme-generator/
├── k8s/                    # Kubernetes configurations
│   ├── base/               # Base Kubernetes setup (kind/minikube)
│   ├── operators/          # Operator deployments (VPA, KEDA)
│   ├── services/           # Service deployments (NATS, Redis)
│   └── monitoring/         # Monitoring setup (Prometheus, metrics)
├── services/
│   ├── backend/            # Rust backend service (will be scaled by KEDA)
│   └── frontend/           # React frontend (will be scaled by HPA)
└── docs/                   # Documentation
```

## Phase 1: Infrastructure Setup

The current phase focuses on setting up the core infrastructure:

- Kubernetes environment using kind/minikube
- Metrics Server for HPA
- VPA operator installation
- KEDA operator installation
- NATS with JetStream configuration
- Redis with VPA configuration
- Prometheus for monitoring

## Future Phases

- Phase 2: Backend Service with KEDA scaling based on NATS queue depth
- Phase 3: Frontend with HPA scaling

## Getting Started

See the setup instructions in [docs/setup.md](docs/setup.md).
