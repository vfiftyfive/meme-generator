#!/bin/bash
set -e

echo "🔄 Importing existing resources into Pulumi state..."

# Import existing service account
echo "Importing service account..."
pulumi import gcp:serviceaccount/account:Account external-dns \
  projects/scaleops-platform/serviceAccounts/external-dns@scaleops-platform.iam.gserviceaccount.com \
  --yes || echo "Service account already imported or doesn't exist"

# Import existing static IP if it exists
echo "Checking for existing static IP..."
if gcloud compute addresses describe meme-generator-ip --global --project=scaleops-platform 2>/dev/null; then
  echo "Importing existing static IP..."
  pulumi import gcp:compute/globalAddress:GlobalAddress meme-generator-ip \
    projects/scaleops-platform/global/addresses/meme-generator-ip \
    --yes || echo "Static IP already imported"
fi

# Import existing namespace
echo "Importing external-dns namespace if it exists..."
if kubectl get namespace external-dns 2>/dev/null; then
  pulumi import kubernetes:core/v1:Namespace external-dns external-dns \
    --yes || echo "Namespace already imported"
fi

echo "✅ Import complete. You can now run 'pulumi up' to ensure all resources are in sync."