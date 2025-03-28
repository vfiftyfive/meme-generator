#!/bin/bash

# Function to check command status
check_status() {
  if [ $? -ne 0 ]; then
    echo "ERROR: $1"
    exit 1
  fi
}

# Set up defaults
GRAFANA_URL="http://localhost:3000"
GRAFANA_USER="admin"
GRAFANA_PASS="password"
DASHBOARD_UID="meme-generator-auto-scaling"

# Check if kubectl is available
if ! command -v kubectl &> /dev/null; then
    echo "kubectl is required but not found!"
    exit 1
fi

echo "Setting up port-forward to Grafana..."
# Kill any existing port-forwards
pkill -f "kubectl port-forward -n monitoring svc/kube-prometheus-stack-grafana" || true
kubectl port-forward -n monitoring svc/kube-prometheus-stack-grafana 3000:80 &
PF_PID=$!
sleep 3
check_status "Failed to set up port forwarding"

echo "Getting current dashboard JSON..."
DASHBOARD_JSON=$(curl -s -k -u "$GRAFANA_USER:$GRAFANA_PASS" "${GRAFANA_URL}/api/dashboards/uid/${DASHBOARD_UID}")
check_status "Failed to get dashboard JSON"

# Extract dashboard JSON
DASHBOARD=$(echo $DASHBOARD_JSON | jq -r '.dashboard')
check_status "Failed to extract dashboard from JSON"

# Extract panels
DASHBOARD_PANELS=$(echo $DASHBOARD | jq -r '.panels')
check_status "Failed to extract panels from dashboard"

# Load new panels
echo "Loading new NATS panels..."
THROUGHPUT_PANEL=$(cat /Users/nvermande/Documents/Dev/meme-generator/k8s/monitoring/nats-throughput-panel.json)
CUMULATIVE_PANEL=$(cat /Users/nvermande/Documents/Dev/meme-generator/k8s/monitoring/nats-cumulative-panel.json)

# Find max panel ID and Y position
MAX_ID=$(echo $DASHBOARD_PANELS | jq -r 'map(.id) | max')
MAX_Y=$(echo $DASHBOARD_PANELS | jq -r 'map(.gridPos.y + .gridPos.h) | max')

# Update panel IDs and positions
THROUGHPUT_PANEL=$(echo $THROUGHPUT_PANEL | jq --argjson id $((MAX_ID + 1)) '.id = $id')
THROUGHPUT_PANEL=$(echo $THROUGHPUT_PANEL | jq --argjson y $MAX_Y '.gridPos.y = $y')

CUMULATIVE_PANEL=$(echo $CUMULATIVE_PANEL | jq --argjson id $((MAX_ID + 2)) '.id = $id')
CUMULATIVE_PANEL=$(echo $CUMULATIVE_PANEL | jq --argjson y $MAX_Y '.gridPos.y = $y')

# Add new panels to dashboard
UPDATED_DASHBOARD=$(echo $DASHBOARD | jq --argjson tp "$THROUGHPUT_PANEL" --argjson cp "$CUMULATIVE_PANEL" '.panels += [$tp, $cp]')
check_status "Failed to add new panels to dashboard"

# Update dashboard
PAYLOAD=$(echo {} | jq --argjson dashboard "$UPDATED_DASHBOARD" '.dashboard = $dashboard | .overwrite = true')
check_status "Failed to create update payload"

echo "Updating dashboard with new NATS panels..."
RESULT=$(curl -s -k -u "$GRAFANA_USER:$GRAFANA_PASS" -X POST -H "Content-Type: application/json" -d "$PAYLOAD" "${GRAFANA_URL}/api/dashboards/db")
check_status "Failed to update dashboard"

# Clean up
kill $PF_PID

echo "Done! Dashboard updated successfully."
echo "New metrics panels added:"
echo "1. NATS Stream Message Rates - Shows message throughput rate per second"
echo "2. NATS Cumulative Message Counts - Shows total historical message counts"
echo ""
echo "Access your dashboard at: ${GRAFANA_URL}/d/${DASHBOARD_UID}"
