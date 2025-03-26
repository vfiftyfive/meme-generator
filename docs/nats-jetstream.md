# NATS with JetStream Setup

This document explains the NATS with JetStream configuration used in the Meme Battle Royale demo.

## Configuration Overview

NATS is deployed using Helm with the following features enabled:
- JetStream for persistent messaging
- Clustering with 3 replicas for high availability
- Monitoring dashboard
- Prometheus metrics integration
- Persistent storage for message data

## Storage Configuration

JetStream is configured with both memory and file storage:
- Memory storage: 2Gi
- File storage: 10Gi
- PVC name: `nats-js-pvc`

## Accessing NATS

### Monitoring Dashboard

To access the NATS monitoring dashboard:

```bash
kubectl port-forward -n messaging svc/nats 8222:8222
```

Then open your browser to [http://localhost:8222](http://localhost:8222)

### JetStream CLI

To use the NATS CLI to interact with JetStream:

```bash
# Get into a pod with NATS CLI
kubectl exec -it -n messaging nats-box -- bash

# Check JetStream status
nats server info | grep -A 10 JetStream

# Create a stream
nats stream add mystream --subjects="meme.>" --storage=file --retention=limits --discard=old --max-msgs=-1 --max-bytes=-1 --max-age=24h --max-msg-size=-1 --dupe-window=2m

# Create a consumer
nats consumer add mystream myconsumer --pull --deliver=all --max-deliver=-1 --ack=explicit --wait=5s

# Publish a message
nats publish meme.new "Hello JetStream"

# Subscribe to messages
nats subscribe meme.>
```

## Integration with KEDA

JetStream is integrated with KEDA for event-driven autoscaling. The KEDA ScaledObject will monitor the JetStream consumer lag to automatically scale the backend service.

Example KEDA ScaledObject:

```yaml
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: meme-generator
  namespace: default
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: meme-generator
  minReplicaCount: 1
  maxReplicaCount: 10
  pollingInterval: 15
  cooldownPeriod: 30
  triggers:
  - type: nats-jetstream
    metadata:
      natsServerMonitoringEndpoint: "nats.messaging.svc.cluster.local:8222"
      stream: "meme-stream"
      consumer: "meme-processor"
      lagThreshold: "10"
```

## Persistence

JetStream data is persisted using a PVC named `nats-js-pvc`. The storage is configured to use the "standard" storage class, which is typically the default in minikube.
