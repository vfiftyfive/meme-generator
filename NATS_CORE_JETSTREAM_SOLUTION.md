# NATS Core vs JetStream Solution

## Problem Summary

The meme-generator application had a critical issue where:
1. Frontend publishes messages via WebSocket to Core NATS (`meme.request` subject)
2. Backend was only consuming from JetStream (durable consumer on `MEMES` stream)
3. Messages from the frontend never reached the backend because Core NATS messages are not automatically stored in JetStream

## Solution Overview

The implemented solution enables the backend to handle BOTH Core NATS subscriptions AND JetStream messages, providing:
- **Real-time processing** via Core NATS for WebSocket messages
- **Reliability and replay** capability via JetStream
- **Message deduplication** to prevent processing the same message twice
- **Comprehensive logging** for debugging and monitoring

## Implementation Details

### 1. Backend Code Changes

#### New Dependencies and Imports
```rust
use std::collections::HashSet;
use tokio::sync::RwLock;
```

#### Configuration Updates
Added new environment variables:
- `ENABLE_CORE_NATS` (default: true) - Enable Core NATS subscription
- `CORE_NATS_QUEUE_GROUP` (default: "meme-generator-core") - Queue group for load balancing

#### Application State Enhancement
```rust
struct AppState {
    // ... existing fields ...
    nats_client: async_nats::Client,  // Core NATS client
    processed_messages: Arc<RwLock<HashSet<String>>>,  // Deduplication set
}
```

#### Dual Subscription Architecture

The backend now runs two parallel message processing loops:

1. **Core NATS Subscription** (`process_core_nats_messages`):
   - Queue subscription for load balancing
   - Immediate processing without persistence
   - Handles real-time WebSocket messages

2. **JetStream Subscription** (`process_jetstream_messages`):
   - Durable consumer with acknowledgment
   - Provides reliability and replay capability
   - Handles persisted messages

#### Message Deduplication
- Maintains an in-memory set of processed message IDs
- Prevents duplicate processing when a message arrives via both channels
- Automatically cleans up old entries (keeps last 5000 when exceeding 10000)

#### Response Publishing
Both success and error responses are published to:
- Core NATS for immediate WebSocket delivery
- JetStream for reliability and potential replay

### 2. Deployment Configuration

Updated `k8s/backend/deployment.yaml`:
```yaml
env:
  - name: ENABLE_CORE_NATS
    value: "true"
  - name: CORE_NATS_QUEUE_GROUP
    value: "meme-generator-core"
```

### 3. Metrics and Monitoring

New metrics added for comprehensive monitoring:
- `meme_generator_core_nats_requests_total`
- `meme_generator_core_nats_success_total`
- `meme_generator_core_nats_errors_total`
- `meme_generator_core_nats_processing_duration_seconds`
- `meme_generator_jetstream_requests_total`
- `meme_generator_jetstream_success_total`
- `meme_generator_jetstream_errors_total`
- `meme_generator_jetstream_processing_duration_seconds`
- `meme_generator_duplicate_messages_total`
- `meme_generator_core_nats_responses_published`
- `meme_generator_jetstream_responses_published`

### 4. Logging Enhancements

Comprehensive logging throughout the message flow:
- Source identification (core_nats vs jetstream)
- Message counts and payload sizes
- Processing status and timing
- Error details with context

## Testing

Use the provided test script to verify the solution:
```bash
./test-core-nats-backend.sh
```

This script:
1. Sets up port forwarding for NATS
2. Sends test messages directly to Core NATS
3. Monitors responses on both success and error channels
4. Checks backend logs for processing confirmation
5. Displays relevant metrics

## Benefits

1. **Backward Compatibility**: Existing JetStream consumers continue to work
2. **Real-time Processing**: WebSocket messages are processed immediately
3. **Reliability**: JetStream provides persistence and replay capability
4. **Scalability**: Queue groups enable load balancing across multiple backends
5. **Observability**: Comprehensive metrics and logging for monitoring
6. **Flexibility**: Can be disabled via environment variable if needed

## Architecture Diagram

```
┌─────────────┐         WebSocket          ┌─────────────┐
│   Frontend  │ ──────────────────────────▶│    NATS     │
│   (React)   │       publish to            │   Server    │
└─────────────┘     'meme.request'         └──────┬──────┘
                                                   │
                                    ┌──────────────┴──────────────┐
                                    │                             │
                              Core NATS                     JetStream
                            (transient)                   (persistent)
                                    │                             │
                                    └──────────────┬──────────────┘
                                                   │
                                            ┌──────▼──────┐
                                            │   Backend   │
                                            │   (Rust)    │
                                            │             │
                                            │ ▪ Core Sub  │
                                            │ ▪ JS Sub   │
                                            │ ▪ Dedup    │
                                            └─────────────┘
```

## Troubleshooting

1. **Messages not being processed**:
   - Check if `ENABLE_CORE_NATS` is set to `true`
   - Verify NATS connectivity
   - Check backend logs for subscription confirmation

2. **Duplicate processing**:
   - Verify deduplication is working by checking metrics
   - Look for "Skipping duplicate message" in logs

3. **Performance issues**:
   - Monitor the size of the deduplication set
   - Check processing duration metrics
   - Consider adjusting the cleanup threshold

## Future Enhancements

1. **Persistent Deduplication**: Use Redis for deduplication across pod restarts
2. **Configurable Retention**: Make deduplication set size configurable
3. **Stream Bridging**: Automatically bridge Core NATS messages to JetStream
4. **Health Checks**: Add specific health checks for both subscription types