#!/bin/bash
# Script to send test requests to the meme generator service

set -e

# Default values
NATS_URL="nats://localhost:4222"
SUBJECT="meme.request"
PROMPT="A cat wearing sunglasses on a beach"
ID=$(uuidgen || date +%s)
GUIDANCE_SCALE=7.5
STEPS=20
NEG_PROMPT=""

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
    --prompt)
      PROMPT="$2"
      shift 2
      ;;
    --id)
      ID="$2"
      shift 2
      ;;
    --guidance)
      GUIDANCE_SCALE="$2"
      shift 2
      ;;
    --steps)
      STEPS="$2"
      shift 2
      ;;
    --negative)
      NEG_PROMPT="$2"
      shift 2
      ;;
    --help)
      echo "Usage: $0 [options]"
      echo "Options:"
      echo "  --nats-url URL     NATS server URL (default: nats://localhost:4222)"
      echo "  --subject SUBJECT  NATS subject (default: meme.request)"
      echo "  --prompt TEXT      Image prompt (default: A cat wearing sunglasses on a beach)"
      echo "  --id ID            Request ID (default: generated UUID)"
      echo "  --guidance NUM     Guidance scale (default: 7.5)"
      echo "  --steps NUM        Inference steps (default: 20)"
      echo "  --negative TEXT    Negative prompt (default: empty)"
      echo "  --help             Show this help message"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Build JSON payload
if [ -z "$NEG_PROMPT" ]; then
  JSON_PAYLOAD=$(cat <<EOF
{
  "id": "$ID",
  "prompt": "$PROMPT",
  "guidance_scale": $GUIDANCE_SCALE,
  "num_inference_steps": $STEPS
}
EOF
)
else
  JSON_PAYLOAD=$(cat <<EOF
{
  "id": "$ID",
  "prompt": "$PROMPT",
  "negative_prompt": "$NEG_PROMPT",
  "guidance_scale": $GUIDANCE_SCALE,
  "num_inference_steps": $STEPS
}
EOF
)
fi

echo "Sending request to $SUBJECT at $NATS_URL with ID $ID"
echo "Prompt: $PROMPT"

# If nats CLI is available, use it to send the request
if command -v nats &> /dev/null; then
  echo "$JSON_PAYLOAD" | nats pub "$SUBJECT" --server="$NATS_URL"
  echo "Request sent! Check the logs for response."
else
  # Otherwise provide instructions
  echo "NATS CLI not found. To install on macOS: brew install nats-io/nats-tools/nats"
  echo "Here's the JSON payload to send manually:"
  echo "$JSON_PAYLOAD"
fi

# Watch for response if nats CLI is available
if command -v nats &> /dev/null; then
  echo "Watching for response on meme.response for 30 seconds..."
  timeout 30 nats sub "meme.response" --server="$NATS_URL" || echo "No response received within timeout"
fi
