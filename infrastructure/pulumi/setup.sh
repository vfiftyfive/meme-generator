#!/bin/bash
set -e

echo "🚀 Setting up Pulumi for Meme Generator Infrastructure"

# Check if pulumi is installed
if ! command -v pulumi &> /dev/null; then
    echo "❌ Pulumi is not installed. Please install it first:"
    echo "   brew install pulumi"
    echo "   or"
    echo "   curl -fsSL https://get.pulumi.com | sh"
    exit 1
fi

# Check if gcloud is configured
if ! command -v gcloud &> /dev/null; then
    echo "❌ gcloud CLI is not installed. Please install it first."
    exit 1
fi

# Get current GCP project
CURRENT_PROJECT=$(gcloud config get-value project 2>/dev/null)
if [ -z "$CURRENT_PROJECT" ]; then
    echo "❌ No GCP project configured. Please run: gcloud config set project YOUR_PROJECT_ID"
    exit 1
fi

echo "📋 Current GCP Project: $CURRENT_PROJECT"

# Prompt for configuration
read -p "GCP Project ID [$CURRENT_PROJECT]: " PROJECT_ID
PROJECT_ID=${PROJECT_ID:-$CURRENT_PROJECT}

read -p "GKE Cluster Name: " GKE_CLUSTER_NAME
if [ -z "$GKE_CLUSTER_NAME" ]; then
    echo "❌ GKE cluster name is required"
    exit 1
fi

read -p "GKE Cluster Location (region or zone): " GKE_CLUSTER_LOCATION
if [ -z "$GKE_CLUSTER_LOCATION" ]; then
    echo "❌ GKE cluster location is required"
    exit 1
fi

read -p "Domain [scaleops-labs.dev]: " DOMAIN
DOMAIN=${DOMAIN:-scaleops-labs.dev}

read -p "Subdomain [meme-generator]: " SUBDOMAIN
SUBDOMAIN=${SUBDOMAIN:-meme-generator}

read -p "Create DNS Zone? (y/N): " CREATE_ZONE
CREATE_ZONE=${CREATE_ZONE:-n}

# Initialize Pulumi stack
echo "📦 Initializing Pulumi stack..."
pulumi stack init production 2>/dev/null || pulumi stack select production

# Set configuration
echo "⚙️  Setting Pulumi configuration..."
pulumi config set gcp:project $PROJECT_ID
pulumi config set domain $DOMAIN
pulumi config set subdomain $SUBDOMAIN
pulumi config set gkeClusterName $GKE_CLUSTER_NAME
pulumi config set gkeClusterLocation $GKE_CLUSTER_LOCATION

if [ "$CREATE_ZONE" == "y" ] || [ "$CREATE_ZONE" == "Y" ]; then
    pulumi config set createDnsZone true
else
    pulumi config set createDnsZone false
fi

# Install dependencies
echo "📥 Installing dependencies..."
npm install

# Show preview
echo ""
echo "✅ Setup complete! Configuration:"
echo "   Project: $PROJECT_ID"
echo "   Domain: $SUBDOMAIN.$DOMAIN"
echo "   GKE Cluster: $GKE_CLUSTER_NAME in $GKE_CLUSTER_LOCATION"
echo ""
echo "Next steps:"
echo "1. Review the infrastructure: pulumi preview"
echo "2. Deploy the infrastructure: pulumi up"
echo "3. Follow the output instructions to complete DNS setup"