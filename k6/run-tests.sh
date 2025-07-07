#!/bin/bash
# k6 Test Runner for Meme Generator

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Configuration
export BASE_URL="${BASE_URL:-http://meme-generator.scaleops-labs.dev}"
export WS_URL="${WS_URL:-ws://meme-generator.scaleops-labs.dev/ws}"
K6_PROJECT_ID="${K6_PROJECT_ID:-}"  # Optional: k6 Cloud project ID

echo -e "${GREEN}🚀 Meme Generator Load Testing Suite${NC}"
echo "Target: $BASE_URL"
echo ""

# Function to run a test
run_test() {
    local test_name=$1
    local test_file=$2
    local watch_hpa=$3
    
    echo -e "${YELLOW}▶ Running $test_name${NC}"
    echo "----------------------------------------"
    
    # Start HPA watcher in background if requested
    if [ "$watch_hpa" = "true" ]; then
        echo "Starting HPA monitor..."
        watch -n 2 "kubectl get hpa -n meme-generator" &
        WATCH_PID=$!
    fi
    
    # Run the test
    if [ -n "$K6_PROJECT_ID" ]; then
        # Run on k6 Cloud
        k6 cloud --project-id="$K6_PROJECT_ID" "$test_file"
    else
        # Run locally with output
        k6 run --out json=results/${test_name}.json "$test_file"
    fi
    
    # Stop HPA watcher
    if [ "$watch_hpa" = "true" ] && [ -n "$WATCH_PID" ]; then
        kill $WATCH_PID 2>/dev/null || true
    fi
    
    echo -e "${GREEN}✓ $test_name completed${NC}"
    echo ""
    
    # Cool down period between tests
    if [ "$test_name" != "5-soak" ]; then
        echo "Cooling down for 2 minutes..."
        sleep 120
    fi
}

# Create results directory
mkdir -p results

# Check if k6 is installed
if ! command -v k6 &> /dev/null; then
    echo -e "${RED}❌ k6 is not installed. Please install it first:${NC}"
    echo "   brew install k6  # macOS"
    echo "   or visit: https://k6.io/docs/getting-started/installation/"
    exit 1
fi

# Menu for test selection
echo "Select test scenario:"
echo "1) Smoke Test (5 min) - Baseline validation"
echo "2) Load Test (30 min) - Normal traffic with HPA scaling"
echo "3) Stress Test (20 min) - Find breaking points"
echo "4) Spike Test (15 min) - Sudden traffic bursts"
echo "5) Soak Test (2 hours) - Long-term stability"
echo "6) Full Suite (3+ hours) - Run all tests"
echo ""
read -p "Enter choice [1-6]: " choice

case $choice in
    1)
        run_test "smoke" "scenarios/1-smoke.js" false
        ;;
    2)
        run_test "load" "scenarios/2-load.js" true
        ;;
    3)
        run_test "stress" "scenarios/3-stress.js" true
        ;;
    4)
        run_test "spike" "scenarios/4-spike.js" true
        ;;
    5)
        echo -e "${YELLOW}⚠️  Soak test will run for 2 hours!${NC}"
        read -p "Continue? [y/N]: " confirm
        if [ "$confirm" = "y" ]; then
            run_test "soak" "scenarios/5-soak.js" false
        fi
        ;;
    6)
        echo -e "${YELLOW}⚠️  Full suite will take 3+ hours!${NC}"
        read -p "Continue? [y/N]: " confirm
        if [ "$confirm" = "y" ]; then
            run_test "smoke" "scenarios/1-smoke.js" false
            run_test "load" "scenarios/2-load.js" true
            run_test "stress" "scenarios/3-stress.js" true
            run_test "spike" "scenarios/4-spike.js" true
        fi
        ;;
    *)
        echo -e "${RED}Invalid choice${NC}"
        exit 1
        ;;
esac

echo -e "${GREEN}🎉 Testing completed!${NC}"
echo ""
echo "Results saved in: ./results/"
echo ""
echo "Next steps:"
echo "1. Review HPA scaling behavior: kubectl describe hpa -n meme-generator"
echo "2. Check pod distribution: kubectl get pods -n meme-generator -o wide"
echo "3. Analyze metrics in monitoring tools"
echo "4. Review k6 HTML report: k6 inspect results/*.json"