# Meme Generator Auto-Scaling Dashboard

This directory contains a Grafana dashboard specifically designed to visualize the auto-scaling capabilities of the Meme Generator application.

## Dashboard Features

The dashboard is organized into three main sections:

### 1. Pod Counts & Scaling
- **Backend Pods (KEDA)**: Shows the number of backend pods scaled by KEDA based on NATS message queue depth
- **Frontend Pods (HPA)**: Shows the number of frontend pods scaled by HPA based on CPU/memory usage

### 2. NATS Metrics
- **NATS JetStream Messages**: Shows metrics for the MEMES stream including:
  - **Pending Messages**: Number of messages waiting to be processed (triggers KEDA scaling over 5)
  - **Waiting Requests**: Number of pull consumers waiting for messages (normal value is 1)
  - **Message Processing Rate**: Rate at which messages are being processed
- **NATS Stream Message Rates**: Shows the rate of messages being received and delivered per second
- **NATS Cumulative Message Counts**: Shows the total historical count of all messages received and delivered

### 3. CPU & Memory Usage
- **Backend CPU/Memory Usage**: Shows aggregate CPU and memory usage as a percentage of limits across all backend pods
- **Frontend CPU/Memory Usage**: Shows aggregate CPU and memory usage as a percentage of limits across all frontend pods
- **Redis CPU/Memory Usage**: Shows CPU and memory usage for Redis pods managed by VPA

## Importing the Dashboard

You can import the dashboard into your Grafana instance using the provided script:

```bash
# Make the script executable
chmod +x import-dashboard.sh

# Run the script (uses default values)
./import-dashboard.sh

# Or specify custom values
./import-dashboard.sh --namespace monitoring --service grafana --port 3000
```

## Demo Tips

For an effective demonstration of the auto-scaling capabilities:

1. **Show the initial state**: Point out the baseline pod counts and resource usage
2. **Generate load**: Use the load generation script to send messages to NATS
   ```bash
   python3 stress/nats_load.py --batch-size 50 --bursts 3 --parallel 10
   ```
3. **Observe KEDA scaling**: Watch the backend pods scale up as messages accumulate
4. **Observe HPA scaling**: As the backend pods process messages, they'll consume more CPU, potentially triggering the frontend HPA
5. **Observe VPA adjustments**: Redis resource allocations may change over time based on usage patterns

## Metrics Explanation

### NATS Metrics
- **Pending Messages**: The number of unprocessed messages in the MEMES stream. This is what KEDA uses to scale the backend. When this exceeds the threshold (5), KEDA will scale up.
- **Waiting Requests**: The number of pull consumers waiting for messages. A value of 1 is normal and indicates the consumer is ready to process messages.
- **Message Processing Rate**: Shows how quickly messages are being processed by the backend.
- **Message Rates**: Shows the per-second rate of messages flowing through the system, which is useful for seeing throughput even when processing is very fast.
- **Cumulative Message Counts**: Shows the total number of messages processed over time, providing historical context.

### Resource Usage Metrics
- **CPU/Memory Usage %**: Shows aggregate resource usage as a percentage of the configured limits across all pods in a deployment. The formula is:
  ```
  (Sum of all CPU/memory used by all matching containers) / (Sum of all CPU/memory limits for those containers) * 100
  ```
- For CPU, this represents cores per second as a percentage of total limit (e.g., 500m = 0.5 cores).
- The frontend HPA uses CPU usage (30% threshold) to trigger scaling.

## Customizing the Dashboard

If you need to modify the dashboard:

1. Edit the `complete-dashboard.json` file
2. Re-import using the `import-dashboard.sh` script
3. Or manually import through the Grafana UI (Dashboard → Import)

## Understanding Fast Message Processing

When testing with load generators, you might notice:

1. **Brief Message Spikes**: Messages may appear briefly in the queue and then quickly disappear as they're processed
2. **Constant Waiting Requests**: The `nats_consumer_num_waiting` metric will typically show a constant value of 1, which is normal
3. **Scaling Without Visible Queue**: Backend pods may scale up even when the dashboard shows 0 pending messages

This happens because:
- The backend processes messages very efficiently
- Prometheus scrapes metrics at intervals (typically 15-30s)
- Messages can arrive and be processed between scrape intervals

To better understand actual throughput, use the **NATS Stream Message Rates** and **NATS Cumulative Message Counts** panels, which show message flow even when the queue appears empty.
