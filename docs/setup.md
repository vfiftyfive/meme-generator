# Meme Battle Royale Setup Guide

This guide walks you through setting up the Kubernetes infrastructure for the Meme Battle Royale demo project, which showcases autoscaling with HPA, VPA, and KEDA.

## Prerequisites

- [Minikube](https://minikube.sigs.k8s.io/docs/start/)
- [kubectl](https://kubernetes.io/docs/tasks/tools/install-kubectl/)
- [Helm](https://helm.sh/docs/intro/install/) (optional - will be installed by setup script if missing)
- [Git](https://git-scm.com/downloads)

## Setup Steps

1. **Start Minikube**

   Run the setup script to create and configure the Minikube cluster:

   ```bash
   chmod +x setup.sh
   ./setup.sh
   ```

   This script will:
   - Start a Minikube cluster
   - Enable metrics-server and ingress addons
   - Install VPA operator
   - Install KEDA operator
   - Deploy NATS with JetStream
   - Deploy Redis using the ot-container-kit Redis Operator
   - Deploy Prometheus and Grafana for monitoring

2. **Verify Installation**

   Check that all components are running correctly:

   ```bash
   kubectl get pods -A
   ```

   Run the status check script:

   ```bash
   chmod +x check-status.sh
   ./check-status.sh
   ```

## Component Details

### Redis

The demo uses the ot-container-kit Redis Operator to deploy and manage Redis. Key features:

- Redis is deployed in the `cache` namespace
- Configuration is managed via a ConfigMap that's referenced by the Redis CR
- Redis metrics are exported for Prometheus monitoring

For detailed information about the Redis setup, see the [Redis Operator documentation](./redis-operator.md).

### NATS JetStream

To access the NATS monitoring interface:

```bash
kubectl port-forward -n messaging svc/nats 8222:8222
```

Then open your browser to [http://localhost:8222](http://localhost:8222)

### Redis

Redis is configured with VPA for automatic resource adjustment. Monitor its resource usage with:

```bash
kubectl describe vpa redis-vpa -n cache
```

### Prometheus & Grafana

Access Prometheus:

```bash
kubectl port-forward -n monitoring svc/prometheus-kube-prometheus-prometheus 9090:9090
```

Then open [http://localhost:9090](http://localhost:9090)

Access Grafana:

```bash
kubectl port-forward -n monitoring svc/prometheus-grafana 3000:80
```

Then open [http://localhost:3000](http://localhost:3000) and log in with:
- Username: admin
- Password: meme-battle

## Next Steps

After completing the infrastructure setup, proceed to:

1. Phase 2: Implement the Rust backend service that will be scaled by KEDA based on NATS queue depth
2. Phase 3: Implement the React frontend that will be scaled by HPA
