#!/bin/bash
# ScaleOps-focused k6 test runner

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

export BASE_URL="${BASE_URL:-http://meme-generator.scaleops-labs.dev}"

echo -e "${GREEN}🚀 ScaleOps Validation Test Suite${NC}"
echo "=================================="
echo "Target: $BASE_URL"
echo ""

# Check prerequisites
check_prerequisites() {
    echo -e "${BLUE}Checking prerequisites...${NC}"
    
    # Check k6
    if ! command -v k6 &> /dev/null; then
        echo -e "${RED}❌ k6 not installed${NC}"
        echo "Install with: brew install k6"
        exit 1
    fi
    
    # Check cluster access
    if ! kubectl get nodes &> /dev/null; then
        echo -e "${RED}❌ Cannot access Kubernetes cluster${NC}"
        exit 1
    fi
    
    # Check HPA status
    echo -e "\n${YELLOW}Current HPA Status:${NC}"
    kubectl get hpa -n meme-generator
    
    # Check node count
    echo -e "\n${YELLOW}Current Nodes:${NC}"
    kubectl get nodes
    
    echo -e "\n${GREEN}✓ Prerequisites satisfied${NC}\n"
}

# Test menu
show_menu() {
    echo "Select ScaleOps validation test:"
    echo ""
    echo "1) HPA Optimization Test (15 min)"
    echo "   - Tests gradual scaling and burst patterns"
    echo "   - Validates ScaleOps HPA enhancements"
    echo ""
    echo "2) Node Bin-Packing Test (20 min)"
    echo "   - Tests pod placement optimization"
    echo "   - Validates optimize-utilization profile"
    echo ""
    echo "3) Resource Efficiency Test (10 min)"
    echo "   - Mixed workload patterns"
    echo "   - Tests CPU vs Memory scaling decisions"
    echo ""
    echo "4) Full ScaleOps Validation (45 min)"
    echo "   - Complete test suite"
    echo "   - Comprehensive report"
    echo ""
    echo "5) Quick Spike Test (5 min)"
    echo "   - Fast validation of scaling response"
    echo ""
}

# Run test with monitoring
run_test() {
    local test_name=$1
    local test_file=$2
    local duration=$3
    
    echo -e "\n${YELLOW}▶ Starting $test_name (Duration: $duration)${NC}"
    echo "----------------------------------------"
    
    # Start monitor in background
    echo -e "${BLUE}Starting ScaleOps monitor...${NC}"
    ./scaleops-monitor.sh --watch &
    MONITOR_PID=$!
    
    # Give monitor time to start
    sleep 2
    
    # Run k6 test
    echo -e "\n${BLUE}Running k6 test...${NC}"
    k6 run \
        --out json=results/scaleops-${test_name}-$(date +%Y%m%d-%H%M%S).json \
        "$test_file"
    
    # Stop monitor
    kill $MONITOR_PID 2>/dev/null || true
    
    echo -e "\n${GREEN}✓ $test_name completed${NC}"
}

# Analyze results
analyze_results() {
    echo -e "\n${YELLOW}📊 ScaleOps Behavior Analysis${NC}"
    echo "================================"
    
    # Check if pods scaled
    echo -e "\n${BLUE}Pod Scaling Summary:${NC}"
    kubectl get deployments -n meme-generator -o custom-columns=\
NAME:.metadata.name,\
DESIRED:.spec.replicas,\
CURRENT:.status.replicas,\
AVAILABLE:.status.availableReplicas
    
    # Check node utilization
    echo -e "\n${BLUE}Node Utilization:${NC}"
    kubectl top nodes
    
    # Check for ScaleOps recommendations
    echo -e "\n${BLUE}ScaleOps Recommendations:${NC}"
    kubectl get recommendations -n meme-generator 2>/dev/null || echo "No new recommendations"
    
    # Summary
    echo -e "\n${GREEN}Key Observations:${NC}"
    echo "1. Check if HPA scaled appropriately for the load"
    echo "2. Verify node bin-packing efficiency"
    echo "3. Look for any ScaleOps policy interventions"
    echo "4. Review resource utilization patterns"
}

# Main execution
check_prerequisites

mkdir -p results

show_menu
read -p "Enter choice [1-5]: " choice

case $choice in
    1)
        run_test "hpa-optimization" "scenarios/scaleops-hpa-test.js" "15 min"
        ;;
    2)
        run_test "node-packing" "scenarios/scaleops-node-packing.js" "20 min"
        ;;
    3)
        export SCENARIO="mixed"
        run_test "resource-efficiency" "scenarios/scaleops-hpa-test.js" "10 min"
        ;;
    4)
        echo -e "${YELLOW}Running full validation suite...${NC}"
        run_test "hpa-optimization" "scenarios/scaleops-hpa-test.js" "15 min"
        sleep 120  # Cool down
        run_test "node-packing" "scenarios/scaleops-node-packing.js" "20 min"
        sleep 120  # Cool down
        export SCENARIO="mixed"
        run_test "resource-efficiency" "scenarios/scaleops-hpa-test.js" "10 min"
        ;;
    5)
        # Quick test - just run simple load
        run_test "quick-spike" "scenarios/scaleops-simple-load.js" "5 min"
        ;;
    *)
        echo -e "${RED}Invalid choice${NC}"
        exit 1
        ;;
esac

analyze_results

echo -e "\n${GREEN}🎉 Testing completed!${NC}"
echo ""
echo "Next steps:"
echo "1. Review results in ./results/"
echo "2. Check ScaleOps dashboard for insights"
echo "3. Compare with baseline (non-ScaleOps) behavior"
echo "4. Document any optimization opportunities"