#!/usr/bin/env python3
"""
KEDA Scaling Monitor for Meme Generator
This script monitors NATS stream messages and KEDA scaling in real-time
"""

import subprocess
import time
import signal
import sys
import json
import os
from datetime import datetime

# Colors for terminal output
class Colors:
    HEADER = '\033[95m'
    BLUE = '\033[94m'
    CYAN = '\033[96m'
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    RED = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'
    UNDERLINE = '\033[4m'

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

def get_stream_info():
    """Get NATS JetStream stream info"""
    try:
        cmd = ["nats", "stream", "info", "MEMES", "-s", "nats://localhost:4222"]
        result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        if result.returncode != 0:
            return {"messages": "N/A", "bytes": "N/A", "first_seq": "N/A", "last_seq": "N/A", "deleted": "N/A"}
        
        lines = result.stdout.strip().split('\n')
        info = {
            "messages": "N/A", 
            "bytes": "N/A", 
            "first_seq": "N/A", 
            "last_seq": "N/A", 
            "deleted": "N/A"
        }
        
        for line in lines:
            line = line.strip()
            if "Messages:" in line and "Maximum Messages:" not in line:
                info["messages"] = line.split("Messages:")[1].strip()
            elif "Bytes:" in line and "Maximum Bytes:" not in line:
                info["bytes"] = line.split("Bytes:")[1].strip()
            elif "First Sequence:" in line:
                info["first_seq"] = line.split("First Sequence:")[1].strip()
            elif "Last Sequence:" in line:
                info["last_seq"] = line.split("Last Sequence:")[1].strip()
            elif "Deleted Messages:" in line:
                info["deleted"] = line.split("Deleted Messages:")[1].strip()
        
        return info
    except Exception as e:
        print(f"❌ Error getting stream info: {e}")
        return {"messages": "N/A", "bytes": "N/A", "first_seq": "N/A", "last_seq": "N/A", "deleted": "N/A"}

def get_pod_count():
    """Get the number of backend pods"""
    try:
        cmd = ["kubectl", "get", "pods", "-n", "meme-generator", "-l", "app=meme-generator", "--no-headers"]
        result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        if result.returncode != 0:
            return 0
        
        lines = result.stdout.strip().split('\n')
        # Filter out empty lines
        lines = [line for line in lines if line.strip()]
        return max(0, len(lines))
    except Exception as e:
        print(f"❌ Error getting pod count: {e}")
        return 0

def get_keda_metrics():
    """Get KEDA metrics"""
    try:
        cmd = ["kubectl", "get", "scaledobject", "meme-generator-backend-scaler", "-n", "meme-generator", "-o", "json"]
        result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        if result.returncode != 0:
            return {"status": "N/A", "last_active": "N/A", "conditions": []}
        
        data = json.loads(result.stdout)
        status = data.get("status", {})
        
        return {
            "status": status.get("scaleTargetKind", "N/A"),
            "last_active": status.get("lastActiveTime", "N/A"),
            "conditions": status.get("conditions", [])
        }
    except Exception as e:
        print(f"❌ Error getting KEDA metrics: {e}")
        return {"status": "N/A", "last_active": "N/A", "conditions": []}

def get_hpa_metrics():
    """Get HPA metrics"""
    try:
        cmd = ["kubectl", "get", "hpa", "keda-hpa-meme-generator-backend-scaler", "-n", "meme-generator", "-o", "json"]
        result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        if result.returncode != 0:
            return {"current_replicas": "N/A", "desired_replicas": "N/A", "metrics": []}
        
        data = json.loads(result.stdout)
        status = data.get("status", {})
        
        # Safely get metrics with default empty list
        metrics = status.get("currentMetrics", [])
        if metrics is None:
            metrics = []
        
        return {
            "current_replicas": status.get("currentReplicas", "N/A"),
            "desired_replicas": status.get("desiredReplicas", "N/A"),
            "metrics": metrics
        }
    except Exception as e:
        print(f"❌ Error getting HPA metrics: {e}")
        return {"current_replicas": "N/A", "desired_replicas": "N/A", "metrics": []}

def format_time():
    """Format current time"""
    return datetime.now().strftime("%H:%M:%S")

def clear_screen():
    """Clear the terminal screen"""
    os.system('cls' if os.name == 'nt' else 'clear')

def main():
    """Main function"""
    global port_forward_process
    
    # Check prerequisites
    if not check_nats_cli():
        cleanup()
        return
    
    # Start port forwarding
    port_forward_process = start_port_forwarding()
    
    print(f"{Colors.BOLD}{Colors.HEADER}🔍 KEDA Scaling Monitor for Meme Generator{Colors.ENDC}")
    print(f"{Colors.CYAN}Press Ctrl+C to stop{Colors.ENDC}")
    
    refresh_count = 0
    pod_history = []
    message_history = []
    
    while True:
        # Clear screen every 5 refreshes to avoid clutter
        if refresh_count % 5 == 0:
            clear_screen()
            print(f"{Colors.BOLD}{Colors.HEADER}🔍 KEDA Scaling Monitor for Meme Generator{Colors.ENDC}")
            print(f"{Colors.CYAN}Press Ctrl+C to stop{Colors.ENDC}")
        
        # Get current time
        current_time = format_time()
        
        # Get stream info
        stream_info = get_stream_info()
        
        # Get pod count
        pod_count = get_pod_count()
        
        # Get KEDA metrics
        keda_metrics = get_keda_metrics()
        
        # Get HPA metrics
        hpa_metrics = get_hpa_metrics()
        
        # Update history
        try:
            messages = int(stream_info["messages"]) if stream_info["messages"] != "N/A" else 0
            message_history.append(messages)
            if len(message_history) > 10:
                message_history.pop(0)
        except:
            pass
        
        pod_history.append(pod_count)
        if len(pod_history) > 10:
            pod_history.pop(0)
        
        # Print header
        print(f"\n{Colors.BOLD}{Colors.BLUE}===== 📊 KEDA Scaling Status at {current_time} ====={Colors.ENDC}")
        
        # Print stream info
        print(f"{Colors.BOLD}🔄 NATS Stream (MEMES):{Colors.ENDC}")
        print(f"  • Messages in queue: {Colors.YELLOW}{stream_info['messages']}{Colors.ENDC}")
        print(f"  • Queue size: {stream_info['bytes']}")
        print(f"  • Last sequence: {stream_info['last_seq']}")
        
        # Print KEDA info
        print(f"\n{Colors.BOLD}⚖️ KEDA ScaledObject:{Colors.ENDC}")
        
        # Print conditions if available
        active_status = "Unknown"
        for condition in keda_metrics.get("conditions", []):
            status = condition.get("status", "Unknown")
            condition_type = condition.get("type", "Unknown")
            status_color = Colors.GREEN if status == "True" else Colors.RED
            
            if condition_type == "Active":
                active_status = status
                
            print(f"  • {condition_type}: {status_color}{status}{Colors.ENDC}")
            if condition.get("message"):
                print(f"    {Colors.CYAN}{condition.get('message')}{Colors.ENDC}")
        
        # Print HPA info
        print(f"\n{Colors.BOLD}🚀 HPA Status:{Colors.ENDC}")
        print(f"  • Current replicas: {Colors.GREEN}{hpa_metrics['current_replicas']}{Colors.ENDC}")
        print(f"  • Desired replicas: {Colors.YELLOW}{hpa_metrics['desired_replicas']}{Colors.ENDC}")
        
        # Print metrics if available
        metrics = hpa_metrics.get("metrics", [])
        if metrics:
            for metric in metrics:
                if metric.get("type") == "External":
                    external = metric.get("external", {})
                    current = external.get("current", {})
                    value = current.get("value")
                    if value:
                        print(f"  • {external.get('metricName', 'Unknown')}: {Colors.YELLOW}{value}{Colors.ENDC}")
        
        # Print scaling info
        print(f"\n{Colors.BOLD}📈 Scaling Status:{Colors.ENDC}")
        print(f"  • Current backend pods: {Colors.GREEN}{pod_count}{Colors.ENDC}")
        print(f"  • KEDA active: {Colors.GREEN if active_status == 'True' else Colors.RED}{active_status}{Colors.ENDC}")
        print(f"  • KEDA threshold: 5 messages")
        
        # Print history
        print(f"\n{Colors.BOLD}📊 History:{Colors.ENDC}")
        pod_history_str = " → ".join([str(p) for p in pod_history])
        print(f"  • Pod count: {Colors.CYAN}{pod_history_str}{Colors.ENDC}")
        
        if message_history:
            message_history_str = " → ".join([str(m) for m in message_history])
            print(f"  • Message count: {Colors.CYAN}{message_history_str}{Colors.ENDC}")
        
        # Refresh every 2 seconds
        time.sleep(2)
        refresh_count += 1

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"❌ Error: {e}")
    finally:
        cleanup()
