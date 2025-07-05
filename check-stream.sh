#!/bin/bash

# Check NATS stream state
echo "Checking NATS JetStream state..."

kubectl exec -n messaging nats-0 -c nats -- sh -c '
# Use nats-server's built-in monitoring
curl -s http://localhost:8222/jsz | grep -E "(streams|messages|bytes|consumers)"
'