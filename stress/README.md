# Stress Testing Tools for Meme Generator

This directory contains tools for stress testing the meme generator application, particularly for demonstrating the multi-tier auto-scaling features (HPA, KEDA, and VPA).

## NATS Load Testing Tools

These tools help you generate load on the NATS JetStream queue to trigger KEDA auto-scaling for the backend service. The load will also indirectly affect the frontend (HPA) and Redis (VPA) scaling as the system processes the requests.

### 1. Bash Script: `nats_load.sh`

A simple bash script that generates load on the NATS queue.

#### Usage:

```bash
# Make the script executable
chmod +x nats_load.sh

# Run the script
./nats_load.sh
```

#### Features:
- Automatically sets up port-forwarding to NATS
- Sends batches of 10 messages to the NATS queue
- Monitors pod count to detect scaling
- Displays NATS queue status

### 2. Python Script: `nats_load.py`

A more advanced Python script with additional features and monitoring capabilities.

#### Prerequisites:

```bash
# Install required Python packages
pip install argparse
```

#### Usage:

```bash
# Make the script executable
chmod +x nats_load.py

# Run with default settings
./nats_load.py

# Run with custom settings
./nats_load.py --batch-size 20 --interval 0.1 --batch-pause 10

# Use custom prompts from a file
./nats_load.py --prompts prompts.txt
```

#### Command-line Options:

- `--batch-size`: Number of messages to send in each batch (default: 10)
- `--interval`: Interval between messages in seconds (default: 0.2)
- `--batch-pause`: Pause between batches in seconds (default: 5)
- `--bursts`: Number of batch bursts to send (default: 3)
- `--parallel`: Number of parallel connections to use (default: 1)
- `--prompts`: File with custom prompts, one per line
- `--fast-mode`: Enable fast mode for image generation (default: false)
- `--small-image`: Generate smaller images to reduce processing time (default: false)

#### Features:
- More detailed monitoring of NATS queue status
- Configurable batch size, timing, and parallel connections
- Support for custom prompts
- Options to toggle fast mode and small image generation
- Real-time metrics display showing queue depth and processing rate
- Colorful and informative output

## Sample Prompts File

You can create a file with custom prompts to use with the Python script:

```bash
# Create a sample prompts file
cat > prompts.txt << 'EOF'
A cat wearing sunglasses on the beach
A dog riding a skateboard in space
A robot making pancakes
A dinosaur using a smartphone
A penguin playing the guitar
A monkey coding on a laptop
A unicorn eating pizza
A panda doing yoga
A sloth drinking coffee
A giraffe wearing a business suit
EOF
```

## Monitoring During Load Testing

While running the load tests, you should monitor:

1. **Backend Pods**:
   ```bash
   kubectl get pods -n meme-generator -l app=meme-generator -w
   ```

2. **KEDA ScaledObject**:
   ```bash
   kubectl get scaledobject -n meme-generator -w
   ```

3. **NATS JetStream Status**:
   ```bash
   # Port-forward NATS monitoring
   kubectl port-forward svc/nats -n messaging 8222:8222
   ```
   Then open http://localhost:8222/jsz in your browser.

4. **Grafana Dashboard**:
   ```bash
   # Port-forward Grafana
   kubectl port-forward svc/grafana -n monitoring 3000:3000
   ```
   Then open http://localhost:3000 and navigate to the Meme Generator Auto-Scaling Dashboard.

5. **Redis Memory Usage**:
   ```bash
   kubectl top pod -n redis
   ```

## Expected Behavior

When running the load tests, you'll observe the multi-tier auto-scaling strategy in action:

### Backend (KEDA) Scaling:
1. Messages will accumulate in the NATS queue
2. KEDA will detect when the pending message count exceeds the threshold (5+ messages)
3. KEDA will trigger scaling of the backend deployment (activates at just 1 message)
4. New backend pods will start processing messages
5. As the queue drains, KEDA will scale down after the cooldown period
6. The backend can scale to zero if no new messages arrive

### Frontend (HPA) Scaling:
1. As users interact with the application, frontend CPU usage will increase
2. When CPU usage exceeds 30% of the limit, HPA will scale up frontend pods
3. Frontend scales up quickly (0s stabilization window)
4. Frontend scales down conservatively (5-minute stabilization window)

### Redis (VPA) Scaling:
1. As more images are cached, Redis memory usage will increase
2. VPA will adjust the resources allocated to Redis within configured limits (up to 1Gi memory)
3. These adjustments happen gradually over time based on observed usage patterns

### Metrics Behavior:
1. **Fast Processing**: The backend processes messages very quickly, so you might not see messages accumulate in the queue for long
2. **Scaling Triggers**: Backend pods may scale up even when the dashboard shows 0 pending messages due to Prometheus scrape intervals
3. **Message Rates**: The NATS Stream Message Rates panel will show throughput even when the queue appears empty
4. **Cumulative Counts**: The total number of processed messages will be visible in the Cumulative Message Counts panel

This demonstrates the comprehensive auto-scaling capabilities across different components using HPA, KEDA, and VPA.
