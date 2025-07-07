#!/bin/bash
# Check if metrics-server is deployed and ready

echo "Checking metrics-server deployment..."

# Check if metrics-server is deployed
if kubectl get deployment metrics-server -n kube-system &> /dev/null; then
    echo "✓ Metrics-server deployment found"
    
    # Check if it's ready
    READY=$(kubectl get deployment metrics-server -n kube-system -o jsonpath='{.status.readyReplicas}')
    DESIRED=$(kubectl get deployment metrics-server -n kube-system -o jsonpath='{.spec.replicas}')
    
    if [ "$READY" == "$DESIRED" ] && [ "$READY" -gt 0 ]; then
        echo "✓ Metrics-server is ready ($READY/$DESIRED replicas)"
        
        # Test metrics API
        if kubectl top nodes &> /dev/null; then
            echo "✓ Metrics API is responding"
            exit 0
        else
            echo "✗ Metrics API is not responding"
            echo "  This might be normal if the server just started. Wait a minute and try again."
            exit 1
        fi
    else
        echo "✗ Metrics-server is not ready ($READY/$DESIRED replicas)"
        exit 1
    fi
else
    echo "✗ Metrics-server not found in kube-system namespace"
    echo "  Deploy infrastructure with Pulumi first"
    exit 1
fi