#!/usr/bin/env python3
"""
NATS Load Generator for KEDA Auto-scaling Demo
This script generates load on the NATS JetStream queue to trigger KEDA scaling
"""

import json
import random
import subprocess
import time
import signal
import sys
import argparse
import os
import threading
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor

# Parse command line arguments
parser = argparse.ArgumentParser(description='Generate load on NATS JetStream for KEDA testing')
parser.add_argument('--batch-size', type=int, default=50, help='Number of messages to send in each batch')
parser.add_argument('--interval', type=float, default=0.05, help='Interval between messages in seconds')
parser.add_argument('--batch-pause', type=int, default=5, help='Pause between batches in seconds')
parser.add_argument('--prompts', type=str, default='', help='File with custom prompts, one per line')
parser.add_argument('--parallel', type=int, default=10, help='Number of parallel message senders')
parser.add_argument('--bursts', type=int, default=3, help='Number of bursts to send in quick succession')
args = parser.parse_args()

# Process management
port_forward_process = None

def cleanup(signum=None, frame=None):
    """Clean up resources before exiting"""
    print("\n🧹 Cleaning up...")
    if port_forward_process:
        port_forward_process.terminate()
        print("✅ Port forwarding terminated")
    sys.exit(0)

# Register signal handlers
signal.signal(signal.SIGINT, cleanup)
signal.signal(signal.SIGTERM, cleanup)

def start_port_forwarding():
    """Start port forwarding to NATS"""
    print("🔌 Setting up port-forwarding to NATS...")
    cmd = ["kubectl", "port-forward", "svc/nats", "-n", "messaging", "4222:4222"]
    process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    time.sleep(3)  # Give port-forwarding time to establish
    return process

def check_nats_cli():
    """Check if NATS CLI is installed"""
    try:
        subprocess.run(["nats", "--version"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
        return True
    except (subprocess.CalledProcessError, FileNotFoundError):
        print("❌ NATS CLI not found. Please install it with:")
        print("brew install nats-io/nats-tools/nats")
        return False

def get_pod_count():
    """Get current count of backend pods"""
    cmd = ["kubectl", "get", "pods", "-n", "meme-generator", "-l", "app=meme-generator"]
    result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if result.returncode != 0:
        print(f"❌ Error getting pod count: {result.stderr}")
        return 0
    
    lines = result.stdout.strip().split('\n')
    # Subtract 1 for the header line if there are any pods
    return max(0, len(lines) - 1)

def get_queue_status():
    """Get NATS JetStream queue status"""
    try:
        cmd = ["nats", "consumer", "info", "MEMES", "meme-generator", "-s", "nats://localhost:4222"]
        result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        if result.returncode != 0:
            return {"pending": "N/A", "ack_pending": "N/A"}
        
        lines = result.stdout.strip().split('\n')
        pending = "N/A"
        ack_pending = "N/A"
        
        for line in lines:
            if "Pending:" in line:
                pending = line.split()[1]
            if "Ack Pending:" in line:
                ack_pending = line.split()[2]
        
        return {"pending": pending, "ack_pending": ack_pending}
    except Exception as e:
        print(f"❌ Error getting queue status: {e}")
        return {"pending": "N/A", "ack_pending": "N/A"}

def send_message(prompt="Test meme", fast_mode=True, small_image=True):
    """Send a message to NATS"""
    message = {
        "prompt": prompt,
        "fast_mode": fast_mode,
        "small_image": small_image
    }
    
    # Convert message to JSON string
    json_message = json.dumps(message)
    
    # Use a direct command to ensure proper JSON formatting
    cmd = ["nats", "pub", "meme.request", json_message, "-s", "nats://localhost:4222"]
    result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    
    if result.returncode != 0:
        print(f"❌ Error sending message: {result.stderr}")
    
    return result.returncode == 0

def load_prompts(filename):
    """Load custom prompts from file"""
    if not filename or not os.path.exists(filename):
        return []
    
    with open(filename, 'r') as f:
        return [line.strip() for line in f if line.strip()]

def send_message_batch(batch_id, prompts, count):
    """Send a batch of messages in parallel"""
    print(f"🚀 Batch {batch_id}: Starting to send {count} messages...")
    success_count = 0
    
    for i in range(count):
        if prompts:
            prompt = random.choice(prompts)
        else:
            prompt = f"Test meme batch {batch_id}-{i} {random.randint(1, 10000)}"
        
        success = send_message(prompt)
        if success:
            success_count += 1
        
        # Very small delay to avoid overwhelming the local system
        time.sleep(0.01)
    
    print(f"✅ Batch {batch_id}: Completed sending {success_count}/{count} messages")
    return success_count

def main():
    """Main function"""
    global port_forward_process
    
    # Check prerequisites
    if not check_nats_cli():
        cleanup()
    
    # Start port forwarding
    port_forward_process = start_port_forwarding()
    
    # Load custom prompts if provided
    custom_prompts = load_prompts(args.prompts)
    
    print("🚀 Starting NATS load generator for KEDA testing")
    print(f"📊 Configuration: Batch size: {args.batch_size}, Parallel senders: {args.parallel}, Bursts: {args.bursts}")
    print("Press Ctrl+C to stop")
    
    cycle = 1
    
    while True:
        print(f"\n===== 🔄 Load Generation Cycle #{cycle} =====")
        timestamp = datetime.now().strftime("%H:%M:%S")
        print(f"⏰ Time: {timestamp}")
        
        # Get current pod count
        before_pod_count = get_pod_count()
        print(f"🔢 Current backend pod count: {before_pod_count}")
        
        # Get queue status before sending
        before_status = get_queue_status()
        print(f"📬 Queue status before: Pending: {before_status['pending']}, Ack Pending: {before_status['ack_pending']}")
        
        # Send multiple bursts of messages in parallel
        total_messages = 0
        print(f"📤 Sending {args.bursts} bursts of {args.batch_size} messages using {args.parallel} parallel senders...")
        
        for burst in range(args.bursts):
            print(f"💥 Burst {burst+1}/{args.bursts} starting...")
            
            # Use ThreadPoolExecutor to send messages in parallel
            with ThreadPoolExecutor(max_workers=args.parallel) as executor:
                # Create a list of futures
                futures = []
                messages_per_thread = args.batch_size // args.parallel
                
                # Submit tasks to the executor
                for i in range(args.parallel):
                    future = executor.submit(send_message_batch, i+1, custom_prompts, messages_per_thread)
                    futures.append(future)
                
                # Wait for all futures to complete and get results
                for future in futures:
                    total_messages += future.result()
            
            print(f"💥 Burst {burst+1}/{args.bursts} completed.")
            
            # Brief pause between bursts
            if burst < args.bursts - 1:
                time.sleep(1)
        
        print(f"✅ Sent total of {total_messages} messages, waiting to see scaling...")
        
        # Short pause to allow KEDA to react
        time.sleep(args.batch_pause)
        
        # Get queue status after sending
        after_status = get_queue_status()
        print(f"📬 Queue status after: Pending: {after_status['pending']}, Ack Pending: {after_status['ack_pending']}")
        
        # Check if scaling occurred
        after_pod_count = get_pod_count()
        print(f"🔢 Updated backend pod count: {after_pod_count}")
        
        if after_pod_count > before_pod_count:
            print(f"✅ KEDA scaling detected! Pods increased from {before_pod_count} to {after_pod_count}")
        else:
            print("⏳ No scaling yet, continuing to generate load...")
        
        # If we have several pods, pause longer to observe behavior
        if after_pod_count > 3:
            print("🔍 Multiple pods detected! Pausing to observe behavior...")
            
            # Get KEDA ScaledObject status
            print("📊 KEDA ScaledObject status:")
            subprocess.run(["kubectl", "get", "scaledobject", "-n", "meme-generator"], 
                          stdout=sys.stdout, stderr=sys.stderr)
            
            # Longer pause
            time.sleep(20)
        else:
            # Short pause between batches
            time.sleep(5)
        
        cycle += 1

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"❌ Error: {e}")
    finally:
        cleanup()
