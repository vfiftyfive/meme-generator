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
| `HF_API_URL` | Hugging Face API URL | Not used (see Image Generation Models section) |
| `CACHE_TTL` | Redis cache TTL in seconds | `3600` |
| `METRICS_ADDR` | Metrics listen address | `0.0.0.0:9090` |

## NATS Configuration

The NATS configuration is consistent across all components of the system:

### NATS Endpoints

| Purpose | Endpoint | Port | Used By |
|---------|----------|------|--------|
| Message Communication | `nats.messaging.svc.cluster.local` | 4222 | Backend service for sending/receiving messages |
| Monitoring | `nats.messaging.svc.cluster.local` | 8222 | KEDA for autoscaling, Prometheus for metrics |
| WebSocket | `nats.messaging.svc.cluster.local` | 8080 | Frontend for browser-based communication |

### NATS Stream Configuration

| Component | Stream Name | Consumer Name | Request Subject | Response Subject |
|-----------|-------------|---------------|-----------------|------------------|
| Rust Backend | `MEMES` | `meme-generator` | `meme.request` | `meme.response` |
| K8s Deployment | `MEMES` | `meme-generator` | `meme.request` | `meme.response` |
| KEDA ScaledObject | `MEMES` | `meme-generator` | N/A | N/A |

### Image Generation Models

The backend uses different Hugging Face models based on request parameters:

| Mode | Model | When Used |
|------|-------|----------|
| Fast Mode | `black-forest-labs/FLUX.1-schnell` | When fast_mode=true OR small_image=true |
| Default | `black-forest-labs/FLUX.1-schnell` | Default model for all requests |

Note: The `HF_API_URL` environment variable is not used by default, as the service uses the FLUX models directly.

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

## CLI Usage

The meme-generator service can be run directly from the command line with various options. All options can be provided either as command-line arguments or environment variables.

### Basic Usage

```bash
# Run with default settings
cargo run

# Run with custom options
cargo run -- --nats-url nats://localhost:4222 --redis-url redis://localhost:6379
```

### Command-line Options

| Option | Environment Variable | Description | Default |
|--------|---------------------|-------------|--------|
| `--nats-url` | `NATS_URL` | NATS server URL | `nats://nats.messaging.svc.cluster.local:4222` |
| `--nats-stream` | `NATS_STREAM` | NATS stream name | `MEMES` |
| `--nats-consumer` | `NATS_CONSUMER` | NATS consumer name | `meme-generator` |
| `--request-subject` | `NATS_REQUEST_SUBJECT` | Subject for incoming requests | `meme.request` |
| `--response-subject` | `NATS_RESPONSE_SUBJECT` | Subject for outgoing responses | `meme.response` |
| `--redis-url` | `REDIS_URL` | Redis URL | `redis://redis.cache.svc.cluster.local:6379` |
| `--hf-api-token` | `HF_API_TOKEN` | Hugging Face API token | (required) |
| `--cache-ttl` | `CACHE_TTL` | Redis cache TTL in seconds | `3600` |
| `--metrics-addr` | `METRICS_ADDR` | Metrics listen address | `0.0.0.0:9090` |

### Examples

```bash
# Run with local NATS and Redis
cargo run -- --nats-url nats://localhost:4222 --redis-url redis://localhost:6379 --hf-api-token your_token_here

# Run with environment variables
export NATS_URL=nats://localhost:4222
export REDIS_URL=redis://localhost:6379
export HF_API_TOKEN=your_token_here
export CACHE_TTL=7200
cargo run

# Run in production mode with all options
cargo run --release -- \
  --nats-url nats://nats.example.com:4222 \
  --nats-stream MEMES \
  --nats-consumer worker-1 \
  --request-subject meme.requests.priority \
  --response-subject meme.responses.processed \
  --redis-url redis://redis.example.com:6379 \
  --hf-api-token your_token_here \
  --cache-ttl 86400 \
  --metrics-addr 0.0.0.0:9090
```

## Testing

Use the provided scripts to test the service:

### Sending Test Requests

The `send-test-request.sh` script allows you to send test requests to the meme generator:

```bash
# Basic usage with default settings
./scripts/send-test-request.sh --prompt "A cat wearing a space helmet on Mars"

# Advanced usage with all options
./scripts/send-test-request.sh \
  --nats-url nats://localhost:4222 \
  --subject meme.request \
  --prompt "A cyberpunk city with flying cars" \
  --id custom-request-id \
  --guidance 7.5 \
  --steps 30 \
  --negative "blurry, bad quality"
```

#### Request Script Options

| Option | Description | Default |
|--------|-------------|--------|
| `--nats-url` | NATS server URL | `nats://localhost:4222` |
| `--subject` | NATS subject | `meme.request` |
| `--prompt` | Image generation prompt | `A cat wearing sunglasses on a beach` |
| `--id` | Request ID | (generated UUID) |
| `--guidance` | Guidance scale | `7.5` |
| `--steps` | Inference steps | `20` |
| `--negative` | Negative prompt | (empty) |

### Watching for Responses

The `watch-responses.sh` script allows you to monitor and save generated images:

```bash
# Basic usage with default settings
./scripts/watch-responses.sh

# Advanced usage with all options
./scripts/watch-responses.sh \
  --nats-url nats://localhost:4222 \
  --subject meme.response \
  --output-dir ./generated-memes \
  --timeout 600
```

#### Watch Script Options

| Option | Description | Default |
|--------|-------------|--------|
| `--nats-url` | NATS server URL | `nats://localhost:4222` |
| `--subject` | NATS subject | `meme.response` |
| `--output-dir` | Directory to save images | `./images` |
| `--timeout` | Watch timeout in seconds | `300` (5 minutes) |

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
