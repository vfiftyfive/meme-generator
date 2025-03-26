#!/bin/bash
# Script to watch for and save responses from the meme generator service

set -e

# Default values
NATS_URL="nats://localhost:4222"
SUBJECT="meme.response"
OUTPUT_DIR="./images"
WATCH_TIMEOUT=300  # 5 minutes in seconds

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --nats-url)
      NATS_URL="$2"
      shift 2
      ;;
    --subject)
      SUBJECT="$2"
      shift 2
      ;;
    --output-dir)
      OUTPUT_DIR="$2"
      shift 2
      ;;
    --timeout)
      WATCH_TIMEOUT="$2"
      shift 2
      ;;
    --help)
      echo "Usage: $0 [options]"
      echo "Options:"
      echo "  --nats-url URL      NATS server URL (default: nats://localhost:4222)"
      echo "  --subject SUBJECT   NATS subject (default: meme.response)"
      echo "  --output-dir DIR    Directory to save images (default: ./images)"
      echo "  --timeout SECONDS   Timeout in seconds (default: 300)"
      echo "  --help              Show this help message"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Create output directory if it doesn't exist
mkdir -p "$OUTPUT_DIR"
echo "Watching for responses on $SUBJECT at $NATS_URL"
echo "Images will be saved to $OUTPUT_DIR"

# Function to extract and save the image from a response
process_message() {
  local message="$1"
  local request_id=$(echo "$message" | jq -r '.request_id')
  local prompt=$(echo "$message" | jq -r '.prompt')
  local image_data=$(echo "$message" | jq -r '.image_data')
  local timestamp=$(echo "$message" | jq -r '.timestamp')
  
  # Create a sanitized filename from the prompt
  local sanitized_prompt=$(echo "$prompt" | tr -dc '[:alnum:] ' | tr ' ' '_' | cut -c 1-50)
  local filename="${OUTPUT_DIR}/${request_id}_${sanitized_prompt}.png"
  
  echo "Received image for request $request_id"
  echo "Prompt: $prompt"
  
  # Decode base64 and save as PNG
  echo "$image_data" | base64 -d > "$filename"
  
  echo "Saved image to $filename"
  echo "----------------"
}

# Check if nats CLI is available
if command -v nats &> /dev/null; then
  echo "Starting to watch for $WATCH_TIMEOUT seconds..."
  
  # Use timeout to limit the watching period
  timeout "$WATCH_TIMEOUT" nats sub "$SUBJECT" --server="$NATS_URL" | while read -r line; do
    # Process each message as it comes in
    process_message "$line"
  done || {
    if [ $? -eq 124 ]; then
      echo "Watch timeout reached after $WATCH_TIMEOUT seconds."
    else
      echo "NATS subscription ended with error."
    fi
  }
else
  echo "NATS CLI not found. To install on macOS: brew install nats-io/nats-tools/nats"
  echo "You can manually subscribe to $SUBJECT and process the responses."
fi
