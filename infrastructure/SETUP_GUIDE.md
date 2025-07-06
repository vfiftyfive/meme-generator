# Complete Setup Guide: Meme Generator with Pulumi & GKE

This guide walks through setting up the complete infrastructure and deploying the meme-generator application to GKE with automatic DNS management.

## Prerequisites

1. **Google Cloud Account** with:
   - Billing enabled
   - A project created
   - Following APIs enabled:
     - Kubernetes Engine API
     - Cloud DNS API
     - Compute Engine API

2. **Local Tools**:
   ```bash
   # Install required tools
   brew install pulumi gcloud-sdk kubectl
   
   # Or use package manager of choice
   ```

3. **Domain**: Access to `scaleops-labs.dev` DNS management

## Step 1: GCP Authentication

```bash
# Login to GCP
gcloud auth login
gcloud auth application-default login

# Set your project
gcloud config set project YOUR_PROJECT_ID
```

## Step 2: Create GKE Cluster (if not exists)

```bash
# Create a GKE cluster with Workload Identity enabled
gcloud container clusters create meme-generator \
  --region us-central1 \
  --num-nodes 2 \
  --machine-type e2-standard-2 \
  --workload-pool=YOUR_PROJECT_ID.svc.id.goog \
  --enable-autorepair \
  --enable-autoupgrade

# Get credentials
gcloud container clusters get-credentials meme-generator --region us-central1
```

## Step 3: Setup Pulumi Infrastructure

```bash
cd infrastructure/pulumi

# Run the setup script
./setup.sh

# When prompted, enter:
# - GCP Project ID: YOUR_PROJECT_ID
# - GKE Cluster Name: meme-generator
# - GKE Cluster Location: us-central1
# - Domain: scaleops-labs.dev
# - Subdomain: meme-generator
# - Create DNS Zone?: N (if zone already exists)
```

## Step 4: Deploy Infrastructure with Pulumi

```bash
# Preview what will be created
pulumi preview

# Deploy the infrastructure
pulumi up

# Note the outputs:
# - nameservers (if creating new zone)
# - staticIpAddress
# - staticIpName
```

## Step 5: Configure DNS (if needed)

If you created a new DNS zone, update your domain registrar to use Google's nameservers shown in the Pulumi output.

If using an existing zone, no action needed - external-dns will manage records automatically.

## Step 6: Deploy the Application

```bash
# Go back to project root
cd ../..

# Create HuggingFace secret
kubectl create secret generic meme-generator-secrets \
  -n meme-generator \
  --from-literal=HF_API_TOKEN=your-huggingface-token \
  --dry-run=client -o yaml | kubectl apply -f -

# Deploy with your domain
DOMAIN=scaleops-labs.dev skaffold run --profile=gke

# This will:
# 1. Build and push Docker images
# 2. Deploy all Kubernetes resources
# 3. Configure ingress with your domain
# 4. external-dns will automatically create DNS records
```

## Step 7: Verify Deployment

```bash
# Check pods
kubectl get pods -n meme-generator

# Check ingress
kubectl get ingress -n meme-generator

# Check DNS propagation (may take a few minutes)
nslookup meme-generator.scaleops-labs.dev

# Check external-dns logs
kubectl logs -n external-dns deployment/external-dns
```

## Step 8: Access the Application

Once DNS propagates (usually 1-5 minutes):

- Frontend: https://meme-generator.scaleops-labs.dev
- WebSocket: wss://meme-generator.scaleops-labs.dev/ws

Google will automatically provision SSL certificates (this can take 10-30 minutes).

## Troubleshooting

### DNS Records Not Created

Check external-dns logs:
```bash
kubectl logs -n external-dns deployment/external-dns
```

Common issues:
- Workload Identity not configured correctly
- Service account missing DNS permissions
- Domain filter not matching

### SSL Certificate Pending

GKE automatically provisions Google-managed certificates. This process can take up to 30 minutes. Check status:
```bash
kubectl describe ingress -n meme-generator meme-generator
```

### WebSocket Connection Failed

Ensure the BackendConfig is applied:
```bash
kubectl get backendconfig -n meme-generator
```

## Clean Up

To remove everything:

```bash
# Delete the application
skaffold delete --profile=gke

# Destroy Pulumi infrastructure
cd infrastructure/pulumi
pulumi destroy

# Delete GKE cluster (if desired)
gcloud container clusters delete meme-generator --region us-central1
```

## Architecture Overview

```
┌─────────────────────┐
│   Domain Registrar  │
│  (scaleops-labs.dev)│
└──────────┬──────────┘
           │ NS records
           ▼
┌─────────────────────┐     ┌─────────────────────┐
│  Google Cloud DNS   │────▶│    external-dns     │
│    (Pulumi managed) │◀────│ (monitors ingress)  │
└─────────────────────┘     └─────────────────────┘
           │ A record
           ▼
┌─────────────────────┐
│   GKE Ingress (LB)  │
│  (Static IP from    │
│     Pulumi)         │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Meme Generator App │
│  - Frontend         │
│  - Backend          │
│  - NATS WebSocket   │
└─────────────────────┘
```

## Key Features

1. **Infrastructure as Code**: All DNS and GCP resources managed by Pulumi
2. **Automatic DNS**: external-dns watches ingresses and creates records
3. **SSL/TLS**: Automatic Google-managed certificates
4. **Static IP**: Persistent IP address for the application
5. **Workload Identity**: Secure access to GCP services without keys