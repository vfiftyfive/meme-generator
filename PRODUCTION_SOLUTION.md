# Production-Ready NATS Solution

## Architecture Overview

The meme generator now uses a **dual-subscription pattern** that handles both:
1. **Core NATS** - For real-time WebSocket messages from the frontend
2. **JetStream** - For reliable, persistent messaging with replay capability

## How It Works

### Frontend → Backend Flow
1. Frontend connects via WebSocket to `ws://nats.meme-generator.local`
2. Frontend publishes messages to Core NATS subject `meme.request`
3. Backend receives messages via Core NATS subscription
4. Backend processes the request and generates the meme
5. Backend publishes response to both Core NATS and JetStream
6. Frontend receives response via WebSocket

### Key Features Implemented

#### 1. **Dual Subscriptions**
- Core NATS subscription with queue groups for load balancing
- JetStream consumer for reliability and message persistence
- Configurable via `ENABLE_CORE_NATS` environment variable

#### 2. **Message Deduplication**
- In-memory HashSet tracks processed message IDs
- Prevents duplicate processing when messages arrive from both sources
- Automatic cleanup of old entries after 5 minutes

#### 3. **Comprehensive Logging**
- Source identification (Core NATS vs JetStream)
- Message flow tracking with request IDs
- Processing duration metrics
- Cache hit/miss logging

#### 4. **Production Metrics**
- Separate counters for Core NATS and JetStream messages
- Processing duration histograms
- Cache performance metrics
- Error tracking by source

## Configuration

### Backend Environment Variables
```yaml
- name: ENABLE_CORE_NATS
  value: "true"  # Enable Core NATS subscriptions
- name: CORE_NATS_QUEUE_GROUP
  value: "meme-generator-core"  # Queue group for load balancing
```

### Scaling
- Multiple backend instances automatically load balance via queue groups
- JetStream ensures at-least-once delivery
- Deduplication prevents duplicate processing

## Benefits

1. **Real-time Processing** - WebSocket messages processed immediately
2. **Reliability** - JetStream provides persistence and replay
3. **Backward Compatibility** - Existing JetStream publishers still work
4. **Observability** - Rich metrics and logging for monitoring
5. **Scalability** - Horizontal scaling with queue groups

## Testing

To verify the system is working:

1. Access http://meme-generator.local
2. Submit a meme request
3. Check backend logs:
   ```bash
   kubectl logs -n meme-generator deploy/meme-backend -f
   ```
4. You should see:
   - "Received Core NATS message"
   - "Successfully parsed Core NATS MemeRequest"
   - Image generation logs
   - "Successfully sent response"

## Monitoring

Key metrics to monitor:
- `meme_generator_core_nats_messages_total` - Core NATS messages received
- `meme_generator_jetstream_messages_total` - JetStream messages received
- `meme_generator_duplicate_messages_total` - Duplicate messages filtered
- `meme_generator_processing_duration_seconds` - Processing time histogram

## Architecture Diagram

```
┌─────────────┐       WebSocket        ┌─────────────┐
│   Frontend  │ ────────────────────► │    NATS     │
│   (React)   │                        │  WebSocket  │
└─────────────┘                        │   Gateway   │
                                       └──────┬──────┘
                                              │
                                              ▼
                                       ┌─────────────┐
                                       │ Core NATS   │
                                       │  Subject:   │
                                       │meme.request │
                                       └──────┬──────┘
                                              │
                  ┌───────────────────────────┴───────────────────────────┐
                  │                                                       │
                  ▼                                                       ▼
           ┌─────────────┐                                        ┌─────────────┐
           │   Backend   │                                        │ JetStream   │
           │   Core NATS │                                        │  Consumer   │
           │Subscription │                                        │  (Durable)  │
           └──────┬──────┘                                        └──────┬──────┘
                  │                                                       │
                  └───────────────────────┬───────────────────────────────┘
                                          │
                                          ▼
                                   ┌─────────────┐
                                   │   Backend   │
                                   │  Processing │
                                   │    Logic    │
                                   └──────┬──────┘
                                          │
                                          ▼
                                   ┌─────────────┐
                                   │ HuggingFace │
                                   │     API     │
                                   └─────────────┘
```

This production-ready solution ensures reliable message processing while maintaining real-time performance for WebSocket clients.