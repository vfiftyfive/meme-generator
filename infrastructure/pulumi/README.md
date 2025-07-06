# Meme Generator Infrastructure with Pulumi

This directory contains Pulumi infrastructure as code for the meme-generator application.

## Step-by-Step Setup Plan

### Prerequisites

1. **Install Pulumi**:
   ```bash
   brew install pulumi
   # or
   curl -fsSL https://get.pulumi.com | sh
   ```

2. **Google Cloud Setup**:
   - GCP Project with billing enabled
   - Cloud DNS API enabled
   - Service account with DNS Admin role
   - GKE cluster already created (or we can add it to Pulumi later)

3. **Required Information**:
   - GCP Project ID
   - GKE Cluster name and region
   - Domain: scaleops-labs.dev
   - Subdomain: meme-generator.scaleops-labs.dev

### Step 1: Initialize Pulumi Project

```bash
cd infrastructure/pulumi
pulumi new gcp-typescript --force
```

### Step 2: Configure GCP Credentials

```bash
# Option A: Use gcloud auth
gcloud auth application-default login

# Option B: Use service account
export GOOGLE_CREDENTIALS=$(cat path/to/service-account-key.json)
```

### Step 3: Set Pulumi Configuration

```bash
pulumi config set gcp:project YOUR_PROJECT_ID
pulumi config set domain scaleops-labs.dev
pulumi config set subdomain meme-generator
```

### Step 4: Deploy Infrastructure

```bash
pulumi up
```

## What Gets Created

1. **Cloud DNS Zone** (if not exists):
   - Managed zone for scaleops-labs.dev

2. **DNS Records**:
   - A record: meme-generator.scaleops-labs.dev → Ingress IP
   - CNAME record: www.meme-generator.scaleops-labs.dev → meme-generator.scaleops-labs.dev

3. **GKE Resources**:
   - Service account for external-dns
   - Workload Identity binding
   - IAM permissions for DNS management

4. **Kubernetes Resources**:
   - external-dns deployment
   - ConfigMap with configuration
   - RBAC resources

## Integration with Skaffold

After Pulumi deployment:

```bash
# Deploy the application with the domain
DOMAIN=scaleops-labs.dev skaffold run --profile=gke
```

## Managing State

Pulumi state can be stored in:
- Pulumi Service (default, free for individuals)
- Google Cloud Storage
- Local file (not recommended for teams)

To use GCS backend:
```bash
pulumi login gs://your-pulumi-state-bucket
```