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

The service follows a message-driven architecture that enables horizontal scaling without requiring direct service-to-service communication. This design is particularly well-suited for Kubernetes autoscaling demonstrations.

### High-Level Flow

1. Receives meme generation requests from NATS JetStream
2. Checks Redis cache for existing results
3. If not cached, calls the Hugging Face API to generate the image
4. Caches the result in Redis
5. Publishes the result back to NATS

### Detailed Message Processing

#### 1. Message Consumption
- Backend instances pull messages from a durable NATS JetStream consumer
- Each message contains a JSON-encoded `MemeRequest` with:
  - Unique request ID
  - Prompt text for image generation
  - Configuration flags (fast_mode, small_image)
- Messages are processed concurrently using Tokio tasks
- Comprehensive metrics are recorded for monitoring and autoscaling

#### 2. Cache Handling
- Each request generates a cache key based on prompt and configuration
- Redis is checked first to avoid redundant image generation
- Cache hits are immediately returned to the client
- Cache misses proceed to image generation
- Successful generations are cached with configurable TTL

#### 3. Image Generation
- Model selection based on request parameters:
  - Fast mode uses optimized model for quicker generation
  - Small image option reduces resolution for faster processing
- Requests are sent to Hugging Face API with appropriate parameters
- Timeouts and error handling ensure robustness
- Generated images are base64-encoded for transmission

#### 4. Response Handling
- Success responses are published to the configured response subject
- Error responses are published to a dedicated error subject
- All messages include the original request ID for correlation
- Messages are acknowledged only after complete processing

### Scaling Characteristics

This architecture provides several scaling advantages:

- **Horizontal Scalability**: Multiple instances process messages in parallel
- **Automatic Load Distribution**: NATS distributes messages among available consumers
- **Stateless Processing**: Each request is self-contained, allowing easy scaling
- **Failure Resilience**: Failed processing can be retried automatically
- **Metrics-Driven Scaling**: HPA and KEDA can scale based on queue depth and resource usage

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
   kubectl apply -k k8s/backend/
   ```

### Autoscaling

The meme-generator backend supports two autoscaling mechanisms:

#### Horizontal Pod Autoscaler (HPA)

The service uses HPA for resource-based autoscaling:

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: meme-generator-hpa
spec:
  minReplicas: 1
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 50
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 70
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 0  # Scale up immediately
    scaleDown:
      stabilizationWindowSeconds: 60  # Wait before scaling down
```

#### KEDA ScaledObject

The service also uses KEDA for event-driven autoscaling based on NATS queue depth:

```yaml
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: nats-scaler
spec:
  scaleTargetRef:
    name: meme-generator
  minReplicaCount: 1
  maxReplicaCount: 10
  pollingInterval: 5   # Check every 5 seconds
  cooldownPeriod: 30   # Scale down after 30 seconds of no triggers
  triggers:
  - type: nats-jetstream
    metadata:
      natsServerMonitoringEndpoint: "nats.messaging.svc.cluster.local:8222"
      stream: "MEMES"
      consumer: "meme-generator"
      lagThreshold: "5"     # Scale up when 5 messages are pending
      activationLagThreshold: "1"  # Activate at 1 message
```

This configuration allows the service to scale based on both resource utilization (via HPA) and message queue depth (via KEDA), ensuring optimal performance during varying workloads.

### Monitoring

The service exposes Prometheus metrics on port 9090 with the following configuration in the deployment:

```yaml
annotations:
  prometheus.io/scrape: "true"
  prometheus.io/path: "/metrics"
  prometheus.io/port: "9090"
```

The Prometheus configuration includes custom relabeling rules to properly collect and label metrics from the meme-generator pods:

```yaml
- job_name: 'meme-generator'
  kubernetes_sd_configs:
  - role: pod
    namespaces:
      names: ['meme-generator']
  relabel_configs:
  - source_labels: [__meta_kubernetes_pod_label_app]
    regex: meme-generator
    action: keep
  - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
    regex: "true"
    action: keep
  - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_path]
    action: replace
    target_label: __metrics_path__
    regex: (.+)
  - source_labels: [__address__, __meta_kubernetes_pod_annotation_prometheus_io_port]
    action: replace
    regex: ([^:]+)(?:\d+)?;(\d+)
    replacement: $1:$2
    target_label: __address__
  # Preserve important labels
  - action: labelmap
    regex: __meta_kubernetes_pod_label_(.+)
  - source_labels: [__meta_kubernetes_namespace]
    action: replace
    target_label: kubernetes_namespace
  - source_labels: [__meta_kubernetes_pod_name]
    action: replace
    target_label: kubernetes_pod_name
```

This configuration enables comprehensive monitoring of the service, including:
- Request counts and processing times
- Cache hit/miss rates
- Error rates
- Resource utilization metrics

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
