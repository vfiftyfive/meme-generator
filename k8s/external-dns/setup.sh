#!/bin/bash
set -e

# Configuration
PROJECT_ID="${GCP_PROJECT_ID:-YOUR_PROJECT_ID}"
DOMAIN="${DOMAIN:-YOUR_DOMAIN.COM}"
CLUSTER_NAME="${CLUSTER_NAME:-meme-generator}"
REGION="${REGION:-us-central1}"

echo "Setting up External DNS for GKE with Cloud DNS"
echo "Project: $PROJECT_ID"
echo "Domain: $DOMAIN"

# 1. Create Cloud DNS zone if it doesn't exist
echo "Creating Cloud DNS zone..."
if ! gcloud dns managed-zones describe meme-generator-zone --project=$PROJECT_ID 2>/dev/null; then
  gcloud dns managed-zones create meme-generator-zone \
    --dns-name="${DOMAIN}." \
    --description="DNS zone for meme generator app" \
    --project=$PROJECT_ID
  
  echo "DNS Zone created. Add these nameservers to your domain registrar:"
  gcloud dns managed-zones describe meme-generator-zone --project=$PROJECT_ID --format="value(nameServers)"
else
  echo "DNS zone already exists"
fi

# 2. Create GCP Service Account for external-dns
echo "Creating GCP service account..."
gcloud iam service-accounts create external-dns \
  --display-name="External DNS for Kubernetes" \
  --project=$PROJECT_ID || true

# 3. Grant DNS admin permissions
echo "Granting DNS permissions..."
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:external-dns@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/dns.admin"

# 4. Enable Workload Identity
echo "Configuring Workload Identity..."
gcloud container clusters update $CLUSTER_NAME \
  --workload-pool="${PROJECT_ID}.svc.id.goog" \
  --region=$REGION \
  --project=$PROJECT_ID

# 5. Create Kubernetes service account binding
kubectl create namespace external-dns --dry-run=client -o yaml | kubectl apply -f -

# 6. Link Kubernetes SA to GCP SA
gcloud iam service-accounts add-iam-policy-binding \
  external-dns@${PROJECT_ID}.iam.gserviceaccount.com \
  --role="roles/iam.workloadIdentityUser" \
  --member="serviceAccount:${PROJECT_ID}.svc.id.goog[external-dns/external-dns]" \
  --project=$PROJECT_ID

# 7. Install external-dns using Helm
echo "Installing external-dns..."
helm repo add external-dns https://kubernetes-sigs.github.io/external-dns/
helm repo update

# Update values.yaml with actual project ID and domain
sed -i.bak \
  -e "s/YOUR_GCP_PROJECT_ID/${PROJECT_ID}/g" \
  -e "s/YOUR_DOMAIN.COM/${DOMAIN}/g" \
  -e "s/YOUR_PROJECT_ID/${PROJECT_ID}/g" \
  k8s/external-dns/values.yaml

helm upgrade --install external-dns external-dns/external-dns \
  --namespace external-dns \
  --values k8s/external-dns/values.yaml \
  --wait

echo "External DNS setup complete!"
echo ""
echo "Next steps:"
echo "1. Update your domain registrar with Cloud DNS nameservers (if not done already)"
echo "2. Deploy your application with the GKE profile"
echo "3. DNS records will be automatically created for your ingresses"