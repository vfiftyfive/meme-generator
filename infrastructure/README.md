# Infrastructure Management

This directory contains the infrastructure as code (IaC) for the meme-generator application.

## Overview

All infrastructure is managed through Pulumi for repeatability and idempotency. The infrastructure includes:

- **DNS Management**: Cloud DNS zone and records
- **External DNS**: Automatic DNS record management for Kubernetes ingresses
- **Metrics Server**: Required for Horizontal Pod Autoscaler (HPA) functionality
- **Static IP**: Reserved IP address for stable ingress access
- **Service Accounts**: Cross-project IAM permissions for DNS management

## Architecture

```
┌─────────────────────────┐     ┌─────────────────────────┐
│  scaleops-platform      │     │  scaleops-dev-rel       │
│  (GKE Cluster)          │     │  (DNS Zone)             │
│                         │     │                         │
│  ┌─────────────────┐    │     │  ┌─────────────────┐   │
│  │ External DNS    │────┼─────┼─>│ Cloud DNS       │   │
│  │ (Deployment)    │    │     │  │ (Zone Records)  │   │
│  └─────────────────┘    │     │  └─────────────────┘   │
│                         │     │                         │
│  ┌─────────────────┐    │     └─────────────────────────┘
│  │ Metrics Server  │    │
│  │ (HPA Support)   │    │
│  └─────────────────┘    │
│                         │
│  ┌─────────────────┐    │
│  │ Meme Generator  │    │
│  │ (App + HPA)     │    │
│  └─────────────────┘    │
└─────────────────────────┘
```

## Prerequisites

1. **Pulumi CLI**: Install from https://www.pulumi.com/docs/get-started/install/
2. **Google Cloud SDK**: Install `gcloud` CLI
3. **Kubernetes CLI**: Install `kubectl`
4. **Appropriate GCP permissions** in both projects

## Configuration

The infrastructure uses the following configuration:

```yaml
# Pulumi.production.yaml
config:
  gcp:project: scaleops-platform              # GKE cluster project
  meme-generator-infrastructure:
    dnsProjectId: scaleops-dev-rel           # DNS zone project
    domain: scaleops-labs.dev                # Root domain
    subdomain: meme-generator                # Application subdomain
    gkeClusterName: devrel                   # GKE cluster name
    gkeClusterLocation: me-west1-a           # GKE cluster location
    createDnsZone: "true"                    # Create DNS zone if missing
```

## Deployment

1. **Set up Pulumi stack**:
   ```bash
   cd infrastructure/pulumi
   pulumi stack select production
   ```

2. **Deploy infrastructure**:
   ```bash
   pulumi up
   ```

3. **Verify deployment**:
   ```bash
   # Check metrics-server
   ./check-metrics-server.sh
   
   # Check external-dns
   kubectl logs -n external-dns -l app.kubernetes.io/name=external-dns
   
   # Check DNS zone
   gcloud dns record-sets list --zone=scaleops-labs-dev --project=scaleops-dev-rel
   ```

## Components

### Metrics Server

Deployed via Helm chart to enable HPA functionality:
- Provides resource metrics (CPU/memory) for pods and nodes
- Required for Horizontal Pod Autoscaler to function
- Configured with GKE-specific settings

### External DNS

Manages DNS records automatically based on Kubernetes ingresses:
- Watches for ingress resources with specific annotations
- Creates/updates/deletes DNS records in Cloud DNS
- Uses Workload Identity for secure cross-project access

### Application HPA

The application includes HPA configurations:
- **Frontend HPA**: Scales 1-5 replicas based on CPU (30%) and memory (70%)
- **Backend HPA**: Scales 1-10 replicas based on CPU (50%) and memory (80%)

These are deployed with the application via Skaffold/Kustomize.

## Troubleshooting

### Metrics Server Issues

If HPA shows `<unknown>` for metrics:
```bash
# Check metrics-server status
kubectl get deployment metrics-server -n kube-system

# Check metrics API
kubectl top nodes
kubectl top pods -n meme-generator

# View metrics-server logs
kubectl logs -n kube-system -l k8s-app=metrics-server
```

### DNS Issues

If DNS records aren't created:
```bash
# Check external-dns logs
kubectl logs -n external-dns -l app.kubernetes.io/name=external-dns

# Verify permissions
gcloud projects get-iam-policy scaleops-dev-rel | grep external-dns

# Check DNS zone
gcloud dns record-sets list --zone=scaleops-labs-dev --project=scaleops-dev-rel
```

### HPA Not Scaling

```bash
# Check HPA status
kubectl describe hpa -n meme-generator

# Check metrics
kubectl get hpa -n meme-generator

# Generate load for testing
kubectl run -i --tty load-generator --rm --image=busybox --restart=Never -- /bin/sh
# Inside the pod: while true; do wget -q -O- http://meme-generator-frontend.meme-generator/; done
```

## Integration with ScaleOps

Once the standard Kubernetes HPA is deployed, ScaleOps controller can enhance it with:
- Cost-aware scaling decisions
- Predictive scaling based on patterns
- Performance optimization
- Production-grade policies

The ScaleOps controller works on top of the standard HPA, requiring no changes to the application.