#!/bin/bash
# Real-time monitoring during k6 tests

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${GREEN}📊 Meme Generator Scaling Monitor${NC}"
echo "================================="
echo ""

# Function to get metrics
get_metrics() {
    echo -e "${BLUE}[$(date +%H:%M:%S)] Cluster Status${NC}"
    echo ""
    
    # HPA Status
    echo -e "${YELLOW}HPA Status:${NC}"
    kubectl get hpa -n meme-generator
    echo ""
    
    # Pod Status with Node Distribution
    echo -e "${YELLOW}Pod Distribution:${NC}"
    kubectl get pods -n meme-generator -o custom-columns=\
NAME:.metadata.name,\
STATUS:.status.phase,\
NODE:.spec.nodeName,\
CPU:.spec.containers[0].resources.requests.cpu,\
MEMORY:.spec.containers[0].resources.requests.memory
    echo ""
    
    # Node Resource Usage
    echo -e "${YELLOW}Node Resources:${NC}"
    kubectl top nodes
    echo ""
    
    # Pod Resource Usage
    echo -e "${YELLOW}Pod Resources:${NC}"
    kubectl top pods -n meme-generator
    echo ""
    
    # Redis Status
    echo -e "${YELLOW}Redis Status:${NC}"
    kubectl get pods -n cache -o wide
    echo ""
    
    # Ingress Status
    echo -e "${YELLOW}Ingress Status:${NC}"
    kubectl get ingress -n meme-generator
    echo ""
    
    echo "═══════════════════════════════════════════════════════"
}

# Watch mode or single run
if [ "$1" = "--watch" ]; then
    # Clear screen and run in loop
    while true; do
        clear
        get_metrics
        sleep 5
    done
else
    # Single run with timestamps
    get_metrics
    
    echo ""
    echo "Tip: Run with --watch for continuous monitoring"
    echo "Example: ./monitor-scaling.sh --watch"
fi