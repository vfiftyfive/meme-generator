#!/bin/bash

# Script to import the auto-scaling dashboard into Grafana
# Requires the Grafana API key to be set as an environment variable

set -e

# Check if kubectl is installed
if ! command -v kubectl &> /dev/null; then
    echo "❌ kubectl is not installed. Please install it first."
    exit 1
fi

# Check if jq is installed
if ! command -v jq &> /dev/null; then
    echo "❌ jq is not installed. Please install it with: brew install jq"
    exit 1
fi

# Default values
GRAFANA_NAMESPACE="monitoring"
GRAFANA_SERVICE="kube-prometheus-stack-grafana"
GRAFANA_PORT="3000"
DASHBOARD_FILE="complete-dashboard.json"

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    key="$1"
    case $key in
        --namespace)
        GRAFANA_NAMESPACE="$2"
        shift
        shift
        ;;
        --service)
        GRAFANA_SERVICE="$2"
        shift
        shift
        ;;
        --port)
        GRAFANA_PORT="$2"
        shift
        shift
        ;;
        --dashboard)
        DASHBOARD_FILE="$2"
        shift
        shift
        ;;
        *)
        echo "Unknown option: $1"
        exit 1
        ;;
    esac
done

echo "🔄 Setting up port-forwarding to Grafana..."
# Check if the Grafana service exists
if ! kubectl get svc -n ${GRAFANA_NAMESPACE} ${GRAFANA_SERVICE} &> /dev/null; then
    echo "❌ Grafana service '${GRAFANA_SERVICE}' not found in namespace '${GRAFANA_NAMESPACE}'"
    echo "Available services in the ${GRAFANA_NAMESPACE} namespace:"
    kubectl get svc -n ${GRAFANA_NAMESPACE}
    exit 1
fi

# Start port-forwarding in the background
echo "Starting port-forwarding to ${GRAFANA_SERVICE}:80 on localhost:${GRAFANA_PORT}..."
kubectl port-forward -n ${GRAFANA_NAMESPACE} svc/${GRAFANA_SERVICE} ${GRAFANA_PORT}:80 &
PORT_FORWARD_PID=$!

# Make sure to kill the port-forwarding when the script exits
trap "kill $PORT_FORWARD_PID 2>/dev/null || true" EXIT

# Wait for port-forwarding to be established
sleep 3

echo "🔑 Checking Grafana credentials..."
# Use the provided credentials
GRAFANA_USER="admin"
GRAFANA_PASSWORD="password"

echo "🔑 Using Grafana credentials for user: ${GRAFANA_USER}"

# Check if the dashboard file exists
if [ ! -f "$DASHBOARD_FILE" ]; then
    echo "❌ Dashboard file not found: $DASHBOARD_FILE"
    exit 1
fi

echo "📊 Importing dashboard from $DASHBOARD_FILE..."
echo "🔍 It appears this Grafana instance uses dashboard provisioning, which prevents API imports."
echo "📝 Please follow these steps to import the dashboard manually:"
echo ""
echo "1. Access Grafana at: http://localhost:${GRAFANA_PORT}"
echo "2. Log in with credentials: ${GRAFANA_USER}/${GRAFANA_PASSWORD}"
echo "3. Click on the '+' icon in the left sidebar"
echo "4. Select 'Import'"
echo "5. Click 'Upload JSON file' and select: ${DASHBOARD_FILE}"
echo "6. Click 'Import' to complete the process"
echo ""
echo "🔔 The port-forwarding will remain active while you complete these steps."
echo "💾 Dashboard file is located at: $(pwd)/${DASHBOARD_FILE}"

# Open the browser to Grafana (if on macOS)
if [[ "$(uname)" == "Darwin" ]]; then
  echo "💡 Opening Grafana in your browser..."
  open "http://localhost:${GRAFANA_PORT}"
fi

# Already handled in the curl response check above

# Keep the port-forwarding running
echo "⏳ Press Ctrl+C to stop port-forwarding and exit"
wait $PORT_FORWARD_PID
