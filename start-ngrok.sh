#!/bin/bash

echo "Starting port forwarding for ngrok..."

# Kill any existing port forwards
pkill -f "port-forward.*meme-generator-frontend"
pkill -f "port-forward.*nats"

# Start port forwarding for frontend
echo "Starting frontend port forward on 8080..."
kubectl port-forward -n meme-generator svc/meme-generator-frontend 8080:80 > /tmp/frontend-port-forward.log 2>&1 &
echo "Frontend port forward PID: $!"

# Start port forwarding for NATS WebSocket
echo "Starting NATS WebSocket port forward on 8081..."
kubectl port-forward -n messaging svc/nats 8081:8080 > /tmp/nats-port-forward.log 2>&1 &
echo "NATS port forward PID: $!"

# Wait for port forwards to be ready
sleep 3

# Start ngrok
echo "Starting ngrok tunnels..."
ngrok start --all --config ngrok.yml