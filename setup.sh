#!/bin/sh
set -e

echo "=== Setting up Meme Battle Royale Kubernetes Demo ==="

# Change to script directory
cd "$(dirname "$0")"

echo "Starting minikube cluster..."
cd k8s/base
chmod +x minikube-config.sh
./minikube-config.sh
cd ../..

# Metrics server and ingress should be enabled via minikube addons
echo "Verifying metrics-server installation..."
minikube addons enable metrics-server

echo "Verifying ingress installation..."
minikube addons enable ingress

echo "Installing Helm if not already installed..."
if ! command -v helm &> /dev/null; then
  echo "Helm not found. Installing Helm..."
  curl -fsSL -o get_helm.sh https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3
  chmod 700 get_helm.sh
  ./get_helm.sh
  rm get_helm.sh
fi

echo "Installing VPA operator..."
echo "Cloning VPA repo..."
git clone https://github.com/kubernetes/autoscaler.git /tmp/autoscaler
echo "Installing VPA..."
cd /tmp/autoscaler/vertical-pod-autoscaler/
./hack/vpa-up.sh
cd - > /dev/null
rm -rf /tmp/autoscaler
 
echo "Installing KEDA operator..."
helm repo add kedacore https://kedacore.github.io/charts
helm repo update
helm install keda kedacore/keda --namespace keda --create-namespace

echo "Deploying Prometheus monitoring..."
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update
kubectl create namespace monitoring
helm install prometheus prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  -f k8s/monitoring/prometheus-values.yaml

# Wait for Prometheus CRDs to be available
echo "Waiting for Prometheus CRDs to be available..."
sleep 10

echo "Deploying NATS with JetStream..."
helm repo add nats https://nats-io.github.io/k8s/helm/charts/
helm repo update
kubectl create namespace messaging
helm install nats nats/nats \
  --namespace messaging \
  -f k8s/services/nats-values.yaml

echo "Installing Redis Operator (ot-container-kit)..."
helm repo add ot-helm https://ot-container-kit.github.io/helm-charts/
helm repo update
kubectl create namespace redis-operator
helm install redis-operator ot-helm/redis-operator \
  --namespace redis-operator \
  -f k8s/services/redis-operator-values.yaml

echo "Waiting for Redis Operator to be available..."
sleep 15

echo "Deploying Redis with Redis Operator..."
kubectl create namespace cache
kubectl apply -f k8s/services/redis-instance.yaml

echo "Making check script executable..."
chmod +x check-status.sh

echo "=== Setup complete! ==="
echo "You can access Prometheus at: http://localhost:9090 (after port-forwarding)"
echo "To port-forward Prometheus: kubectl port-forward -n monitoring svc/prometheus-kube-prometheus-prometheus 9090:9090"
echo "To port-forward Grafana: kubectl port-forward -n monitoring svc/prometheus-grafana 3000:80"
echo "To port-forward NATS monitoring: kubectl port-forward -n messaging svc/nats 8222:8222"
echo ""
echo "To check the status of all components: ./check-status.sh"
