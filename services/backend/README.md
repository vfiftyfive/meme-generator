# Meme Generator Backend

This is the backend service for the Meme Battle Royale Kubernetes autoscaling demo. It's written in Rust and provides meme image generation via Stable Diffusion.

## Features

- Subscribes to NATS JetStream for incoming meme generation requests
- Caches results in Redis to improve performance
- Calls the Hugging Face Stable Diffusion API for image generation
- Publishes generated images back to NATS
- Exposes Prometheus metrics for monitoring
- Scales automatically with KEDA based on NATS queue depth

## Architecture

The service follows a message-driven architecture:

1. Receives meme generation requests from NATS JetStream
2. Checks Redis cache for existing results
3. If not cached, calls the Hugging Face API to generate the image
4. Caches the result in Redis
5. Publishes the result back to NATS

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NATS_URL` | NATS server URL | `nats://nats.messaging.svc.cluster.local:4222` |
| `NATS_STREAM` | NATS stream name | `MEMES` |
| `NATS_CONSUMER` | NATS consumer name | `meme-generator` |
| `NATS_REQUEST_SUBJECT` | Subject for incoming requests | `meme.request` |
| `NATS_RESPONSE_SUBJECT` | Subject for outgoing responses | `meme.response` |
| `REDIS_URL` | Redis URL | `redis://redis.cache.svc.cluster.local:6379` |
| `HF_API_TOKEN` | Hugging Face API token | (required) |
| `HF_API_URL` | Hugging Face API URL | `https://api-inference.huggingface.co/models/runwayml/stable-diffusion-v1-5` |
| `CACHE_TTL` | Redis cache TTL in seconds | `3600` |
| `METRICS_ADDR` | Metrics listen address | `0.0.0.0:9090` |

## Development

### Prerequisites

- Rust 1.60+
- Docker (for building the container)
- Access to NATS and Redis
- Hugging Face API token

### Local Development

1. Install Rust dependencies:
   ```bash
   cargo build
   ```

2. Run the service locally:
   ```bash
   cargo run
   ```

## Building and Deployment

### Building the Docker Image

```bash
docker build -t meme-generator:latest .
```

### Deploying to Kubernetes

1. Create the namespace and secret:
   ```bash
   kubectl create namespace meme-generator
   kubectl create secret generic meme-generator-secrets \
     --namespace meme-generator \
     --from-literal=HF_API_TOKEN=your_huggingface_token_here
   ```

2. Deploy to Kubernetes:
   ```bash
   kubectl apply -f k8s/deployment.yaml
   kubectl apply -f k8s/keda-scaledobject.yaml
   ```

## Testing

Use the provided scripts to test the service:

### Sending Test Requests

```bash
./scripts/send-test-request.sh --prompt "A cat wearing a space helmet on Mars"
```

### Watching for Responses

```bash
./scripts/watch-responses.sh
```

## Metrics

The service exposes Prometheus metrics on port 9090, including:

- `meme_generator_requests_total`: Total number of requests received
- `meme_generator_success_total`: Total number of successful generations
- `meme_generator_errors_total`: Total number of failed generations
- `meme_generator_cache_hits_total`: Total number of cache hits
- `meme_generator_cache_misses_total`: Total number of cache misses
- `meme_generator_processing_duration_seconds`: Processing time histogram
- `meme_generator_generation_duration_seconds`: Image generation time histogram

## Autoscaling

The service is configured to autoscale using KEDA based on NATS queue depth:
- Scales to zero when there are no pending messages
- Scales up when there are 5 or more pending messages
- Maximum of 10 replicas
