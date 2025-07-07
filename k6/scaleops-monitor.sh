#!/bin/bash
# Monitor ScaleOps-specific behaviors during testing

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}🔍 ScaleOps Behavior Monitor${NC}"
echo "==============================="

# Function to check ScaleOps recommendations
check_scaleops() {
    echo -e "\n${BLUE}ScaleOps Recommendations:${NC}"
    kubectl get recommendations -n meme-generator 2>/dev/null || echo "No recommendations found"
    
    echo -e "\n${BLUE}ScaleOps Policies:${NC}"
    kubectl get hpapolicies.analysis.scaleops.sh -n scaleops-system
}

# Function to monitor HPA with ScaleOps context
monitor_hpa() {
    echo -e "\n${YELLOW}HPA Status (ScaleOps Enhanced):${NC}"
    kubectl get hpa -n meme-generator -o custom-columns=\
NAME:.metadata.name,\
TARGET-CPU:.spec.metrics[0].resource.target.averageUtilization,\
CURRENT-CPU:.status.currentMetrics[0].resource.current.averageUtilization,\
MIN:.spec.minReplicas,\
MAX:.spec.maxReplicas,\
CURRENT:.status.currentReplicas,\
DESIRED:.status.desiredReplicas
}

# Function to check node utilization for bin-packing
check_node_utilization() {
    echo -e "\n${YELLOW}Node Utilization (Bin-Packing Efficiency):${NC}"
    
    # Get node metrics
    kubectl top nodes --no-headers | while read node cpu_percent cpu_value memory_percent memory_value; do
        # Extract node name
        node_name=$(echo $node | awk '{print $1}')
        
        # Get pod count on node
        pod_count=$(kubectl get pods --all-namespaces --field-selector spec.nodeName=$node_name --no-headers | wc -l)
        
        # Get allocatable resources
        allocatable=$(kubectl get node $node_name -o jsonpath='{.status.allocatable.pods}')
        
        echo "$node_name: $pod_count/$allocatable pods, CPU: $cpu_percent, Memory: $memory_percent"
    done
}

# Function to check pod distribution
check_pod_distribution() {
    echo -e "\n${YELLOW}Pod Distribution Across Nodes:${NC}"
    kubectl get pods -n meme-generator -o custom-columns=\
POD:.metadata.name,\
NODE:.spec.nodeName,\
CPU-REQ:.spec.containers[0].resources.requests.cpu,\
MEM-REQ:.spec.containers[0].resources.requests.memory,\
STATUS:.status.phase \
--sort-by='.spec.nodeName'
}

# Function to monitor autoscaling events
monitor_events() {
    echo -e "\n${YELLOW}Recent Scaling Events:${NC}"
    kubectl get events -n meme-generator \
        --field-selector reason=SuccessfulRescale \
        --sort-by='.lastTimestamp' \
        | tail -5
        
    kubectl get events -n kube-system \
        --field-selector reason=ScaledUpGroup,reason=ScaleDown \
        --sort-by='.lastTimestamp' \
        | tail -5
}

# Main monitoring loop
if [ "$1" = "--watch" ]; then
    while true; do
        clear
        echo -e "${GREEN}🔍 ScaleOps Behavior Monitor${NC} - $(date)"
        echo "=============================================="
        
        monitor_hpa
        check_node_utilization
        check_pod_distribution
        monitor_events
        check_scaleops
        
        echo -e "\n${BLUE}Refreshing in 10 seconds... (Ctrl+C to exit)${NC}"
        sleep 10
    done
else
    # Single run
    monitor_hpa
    check_node_utilization
    check_pod_distribution
    monitor_events
    check_scaleops
    
    echo -e "\n${GREEN}Tip:${NC} Run with --watch for continuous monitoring"
    echo "Example: ./scaleops-monitor.sh --watch"
fi