#!/bin/bash
set -e

echo "🚀 Deploying Meme Generator Application"

# Parse arguments
PROFILE=${1:-ngrok}
echo "Using profile: $PROFILE"

# Step 1: Create namespaces
echo "📁 Creating namespaces..."
kubectl apply -f k8s/base/namespaces.yaml

# Step 2: Deploy NATS
echo "🔌 Deploying NATS..."
kubectl apply -f k8s/nats/nats-simple.yaml

# Step 3: Deploy with Skaffold
echo "🏗️  Deploying application with Skaffold..."
skaffold run --profile=$PROFILE

# Step 4: Wait for NATS
echo "⏳ Waiting for NATS to be ready..."
kubectl rollout status statefulset/nats -n messaging --timeout=60s

# Step 5: Restart backend to ensure connection
echo "🔄 Ensuring backend connects to NATS..."
kubectl rollout restart deployment/meme-backend -n meme-generator || true
kubectl rollout status deployment/meme-backend -n meme-generator --timeout=60s || true

echo "✅ Deployment complete!"

if [ "$PROFILE" == "ngrok" ]; then
  echo ""
  echo "🌐 Application is available at: https://nic.scaleops.ngrok.dev"
  echo "🔌 WebSocket URL: wss://nic.scaleops.ngrok.dev/ws"
fi