#!/usr/bin/env python3
"""
NATS Stream Purge Utility
This script purges all messages from the NATS stream to start fresh
"""

import subprocess
import time
import signal
import sys

# Process management
port_forward_process = None

def signal_handler(sig, frame):
    """Handle Ctrl+C"""
    print("\n🧹 Cleaning up...")
    cleanup()
    sys.exit(0)

signal.signal(signal.SIGINT, signal_handler)

def cleanup():
    """Clean up resources"""
    global port_forward_process
    if port_forward_process:
        print("✅ Terminating port forwarding...")
        port_forward_process.terminate()
        port_forward_process = None

def check_nats_cli():
    """Check if NATS CLI is installed"""
    try:
        result = subprocess.run(["nats", "--version"], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if result.returncode != 0:
            print("❌ NATS CLI not found. Please install it first.")
            print("   brew install nats-io/nats-tools/nats")
            return False
        return True
    except FileNotFoundError:
        print("❌ NATS CLI not found. Please install it first.")
        print("   brew install nats-io/nats-tools/nats")
        return False

def start_port_forwarding():
    """Start port forwarding to NATS"""
    print("🔌 Setting up port-forwarding to NATS...")
    try:
        process = subprocess.Popen(
            ["kubectl", "port-forward", "svc/nats", "4222:4222", "-n", "messaging"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE
        )
        # Give it a moment to establish
        time.sleep(2)
        return process
    except Exception as e:
        print(f"❌ Error setting up port forwarding: {e}")
        sys.exit(1)

def purge_stream():
    """Purge all messages from the NATS stream"""
    try:
        print("🧹 Purging all messages from NATS stream MEMES...")
        cmd = ["nats", "stream", "purge", "MEMES", "--force", "-s", "nats://localhost:4222"]
        result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        
        if result.returncode != 0:
            print(f"❌ Error purging stream: {result.stderr}")
            return False
        
        print("✅ Successfully purged all messages from NATS stream MEMES")
        return True
    except Exception as e:
        print(f"❌ Error purging stream: {e}")
        return False

def get_stream_info():
    """Get NATS JetStream stream info"""
    try:
        cmd = ["nats", "stream", "info", "MEMES", "-s", "nats://localhost:4222"]
        result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        if result.returncode != 0:
            return None
        
        return result.stdout
    except Exception as e:
        print(f"❌ Error getting stream info: {e}")
        return None

def main():
    """Main function"""
    global port_forward_process
    
    # Check prerequisites
    if not check_nats_cli():
        cleanup()
        return
    
    # Start port forwarding
    port_forward_process = start_port_forwarding()
    
    # Get stream info before purge
    print("📊 Stream info before purge:")
    stream_info = get_stream_info()
    if stream_info:
        print(stream_info)
    else:
        print("❌ Could not get stream info")
    
    # Purge stream
    success = purge_stream()
    
    if success:
        # Get stream info after purge
        print("\n📊 Stream info after purge:")
        stream_info = get_stream_info()
        if stream_info:
            print(stream_info)
        else:
            print("❌ Could not get stream info")
    
    # Clean up
    cleanup()

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"❌ Error: {e}")
    finally:
        cleanup()
