#!/bin/sh
# Minikube configuration script for Meme Battle Royale demo

# Start minikube with required resources and addons
minikube start \
  --cpus=4 \
  --memory=8192 \
  --driver=docker \
  --kubernetes-version=v1.25.3 \
  --addons=metrics-server \
  --addons=ingress

# Enable metrics server (in case the addon doesn't work correctly)
minikube addons enable metrics-server
minikube addons enable ingress

