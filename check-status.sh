#!/bin/sh
# Status check script for Meme Battle Royale demo infrastructure

echo "=== Checking Meme Battle Royale Infrastructure Status ==="

# Check minikube status
echo "\n[Minikube Status]"
minikube status

# Check all namespaces
echo "\n[Namespaces]"
kubectl get namespaces

# Check metrics-server status
echo "\n[Metrics Server]"
kubectl get pods -n kube-system -l k8s-app=metrics-server
echo "Testing metrics API access:"
kubectl top nodes

# Check VPA status
echo "\n[Vertical Pod Autoscaler]"
kubectl get pods -n kube-system -l app=vertical-pod-autoscaler

# Check KEDA status
echo "\n[KEDA]"
kubectl get pods -n keda

# Check NATS status
echo "\n[NATS]"
kubectl get pods -n messaging -l app.kubernetes.io/name=nats
kubectl get statefulset -n messaging
echo "NATS Services:"
kubectl get svc -n messaging
echo "NATS PVC Status:"
kubectl get pvc -n messaging
echo "NATS JetStream status:"
kubectl exec -n messaging nats-0 -- nats server info 2>/dev/null | grep -A 2 JetStream || echo "JetStream status not available yet - wait for pods to be ready"

# Check Redis Operator and Redis Instance
echo "\n[Redis Operator]"
kubectl get pods -n redis-operator -l control-plane=redis-controller-manager

echo "\n[Redis]"
kubectl get redis -n cache
kubectl get pods -n cache -l redis.redis.opstreelabs.in/name=redis
echo "Redis Services:"
kubectl get svc -n cache
echo "Redis PVC Status:"
kubectl get pvc -n cache
echo "Redis Metrics:"
kubectl get servicemonitor -n cache

# Check Prometheus and Grafana
echo "\n[Monitoring]"
kubectl get pods -n monitoring
echo "Prometheus Services:"
kubectl get svc -n monitoring | grep prometheus
echo "Grafana Service:"
kubectl get svc -n monitoring | grep grafana

echo "\n=== Status Check Complete ==="
echo "If any components are missing or not running, you may need to rerun the setup script."
echo "For troubleshooting, check the setup.md file in the docs directory."
