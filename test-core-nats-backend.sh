#!/bin/bash
# Test script to verify Core NATS messaging works with the updated backend

echo "🧪 Testing Core NATS Backend Integration"
echo "======================================"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Port-forward NATS if not already done
echo -e "${YELLOW}Setting up port forwarding for NATS...${NC}"
kubectl port-forward -n messaging svc/nats 4222:4222 8222:8222 >/dev/null 2>&1 &
NATS_PF_PID=$!
sleep 2

# Function to send test message
send_test_message() {
    local PROMPT="$1"
    local REQUEST_ID=$(uuidv4 2>/dev/null || echo "test-$(date +%s)")
    
    echo -e "\n${YELLOW}Sending test message...${NC}"
    echo "Request ID: $REQUEST_ID"
    echo "Prompt: $PROMPT"
    
    # Create the JSON payload
    local PAYLOAD=$(cat <<EOF
{
  "id": "$REQUEST_ID",
  "prompt": "$PROMPT",
  "fast_mode": true,
  "small_image": true
}
EOF
)
    
    echo -e "\nPayload:"
    echo "$PAYLOAD" | jq . 2>/dev/null || echo "$PAYLOAD"
    
    # Subscribe to responses in background
    echo -e "\n${YELLOW}Starting response listener...${NC}"
    timeout 30 nats sub "meme.response" -s nats://localhost:4222 > response_$REQUEST_ID.log 2>&1 &
    SUB_PID=$!
    
    timeout 30 nats sub "meme.response.error" -s nats://localhost:4222 > error_$REQUEST_ID.log 2>&1 &
    ERR_SUB_PID=$!
    
    sleep 1
    
    # Publish the message
    echo -e "\n${YELLOW}Publishing to Core NATS...${NC}"
    echo "$PAYLOAD" | nats pub "meme.request" -s nats://localhost:4222
    
    # Wait for response
    echo -e "\n${YELLOW}Waiting for response (max 25 seconds)...${NC}"
    
    local COUNT=0
    while [ $COUNT -lt 25 ]; do
        if grep -q "$REQUEST_ID" response_$REQUEST_ID.log 2>/dev/null; then
            echo -e "${GREEN}✅ Response received!${NC}"
            echo -e "\nResponse content:"
            grep "$REQUEST_ID" response_$REQUEST_ID.log | head -1 | jq . 2>/dev/null || cat response_$REQUEST_ID.log
            break
        elif grep -q "$REQUEST_ID" error_$REQUEST_ID.log 2>/dev/null; then
            echo -e "${RED}❌ Error response received!${NC}"
            echo -e "\nError content:"
            grep "$REQUEST_ID" error_$REQUEST_ID.log | head -1 | jq . 2>/dev/null || cat error_$REQUEST_ID.log
            break
        fi
        sleep 1
        COUNT=$((COUNT + 1))
        echo -n "."
    done
    
    if [ $COUNT -eq 25 ]; then
        echo -e "\n${RED}❌ No response received within timeout${NC}"
    fi
    
    # Clean up
    kill $SUB_PID $ERR_SUB_PID 2>/dev/null
    rm -f response_$REQUEST_ID.log error_$REQUEST_ID.log
}

# Check backend logs function
check_backend_logs() {
    echo -e "\n${YELLOW}Checking backend logs...${NC}"
    local POD=$(kubectl get pods -n default -l app=meme-backend -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)
    
    if [ -z "$POD" ]; then
        echo -e "${RED}❌ No backend pod found${NC}"
        return
    fi
    
    echo "Backend pod: $POD"
    echo -e "\nRecent logs mentioning Core NATS:"
    kubectl logs -n default $POD --tail=50 | grep -E "(Core NATS|core_nats)" | tail -10
}

# Check NATS stream status
check_nats_status() {
    echo -e "\n${YELLOW}Checking NATS status...${NC}"
    
    # Check if stream exists
    echo -e "\nChecking JetStream streams:"
    nats stream ls -s nats://localhost:4222 2>/dev/null || echo "Unable to list streams"
    
    # Check stream info
    echo -e "\nChecking MEMES stream info:"
    nats stream info MEMES -s nats://localhost:4222 2>/dev/null || echo "Unable to get stream info"
    
    # Check consumer info
    echo -e "\nChecking consumer info:"
    nats consumer ls MEMES -s nats://localhost:4222 2>/dev/null || echo "Unable to list consumers"
}

# Main test flow
echo -e "\n${YELLOW}1. Checking NATS connectivity...${NC}"
if nats server ping -s nats://localhost:4222 >/dev/null 2>&1; then
    echo -e "${GREEN}✅ NATS is accessible${NC}"
else
    echo -e "${RED}❌ Cannot connect to NATS${NC}"
    echo "Please ensure port-forwarding is set up: kubectl port-forward -n messaging svc/nats 4222:4222"
    kill $NATS_PF_PID 2>/dev/null
    exit 1
fi

# Check NATS status
check_nats_status

# Check backend logs first
check_backend_logs

# Send test messages
echo -e "\n${YELLOW}2. Sending test messages...${NC}"

# Test 1: Simple message
send_test_message "Core NATS test: Generate a funny meme about debugging"

# Test 2: Another message to verify continuous processing
send_test_message "Core NATS test: Create a meme about coffee and coding"

# Final backend log check
echo -e "\n${YELLOW}3. Final backend log check...${NC}"
check_backend_logs

# Check metrics
echo -e "\n${YELLOW}4. Checking backend metrics...${NC}"
POD=$(kubectl get pods -n default -l app=meme-backend -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)
if [ ! -z "$POD" ]; then
    echo "Fetching Core NATS metrics:"
    kubectl exec -n default $POD -- wget -q -O - http://localhost:9090/metrics | grep -E "core_nats|jetstream" | grep -v "#" | sort
fi

# Cleanup
echo -e "\n${YELLOW}Cleaning up...${NC}"
kill $NATS_PF_PID 2>/dev/null

echo -e "\n${GREEN}✅ Test completed!${NC}"
echo -e "\nSummary:"
echo "- Core NATS messaging has been tested"
echo "- Check the responses above to verify messages were processed"
echo "- Backend should show logs for both Core NATS and JetStream processing"