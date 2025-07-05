#!/bin/bash

# Test if messages are in Core NATS vs JetStream

echo "Testing NATS message flow..."

# First, let's create a Core NATS subscriber
kubectl run -n messaging nats-test --rm -it --image=natsio/nats-box:latest --restart=Never -- sh -c '
echo "Subscribing to meme.request on Core NATS..."
nats sub meme.request --server=nats://nats:4222
'