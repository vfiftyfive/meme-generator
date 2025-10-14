#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: nats-queue-load.sh [options]

Launch a Kubernetes Job that publishes JSON meme requests with `nats bench js pub`
to stress the MEMES JetStream stream. This is intended to trigger the backend
KEDA scaler during the autoscaler conflict demo without needing local
port-forwarding.

Options:
  --messages NUM      Total messages to publish (default: 4000)
  --clients NUM       Concurrent publisher workers (default: 40)
  --batch NUM         Batch size before waiting for acks (default: 200)
  --prompt TEXT       Prompt to include in each request (default: "Conflict demo load")
  --fast-mode         Set fast_mode=true in the payload (default: false)
  --small-image       Set small_image=true in the payload (default: false)
  --server URL        NATS server URL (default: nats://nats.messaging.svc.cluster.local:4222)
  --subject NAME      NATS subject to publish to (default: meme.request)
  --stream NAME       JetStream stream name (default: MEMES)
  --namespace NAME    Namespace for the Job (default: meme-generator)
  --job-name NAME     Name for the Job resource (default: nats-queue-load)
  --no-tail           Do not stream job logs after creation
  --keep-job          Leave the Job in place after completion (default deletes it)
  -h, --help          Show this help message
USAGE
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "❌ Missing required command: $1" >&2
    exit 1
  fi
}

require_cmd kubectl
require_cmd python3
require_cmd base64

NAMESPACE="meme-generator"
JOB_NAME="nats-queue-load"
SERVER="nats://nats.messaging.svc.cluster.local:4222"
SUBJECT="meme.request"
STREAM="MEMES"
MESSAGES=4000
CLIENTS=40
BATCH=200
FAST_MODE="false"
SMALL_IMAGE="false"
PROMPT="Conflict demo load"
TAIL_LOGS="true"
KEEP_JOB="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --messages)
      MESSAGES="$2"
      shift 2
      ;;
    --clients)
      CLIENTS="$2"
      shift 2
      ;;
    --batch)
      BATCH="$2"
      shift 2
      ;;
    --server)
      SERVER="$2"
      shift 2
      ;;
    --subject)
      SUBJECT="$2"
      shift 2
      ;;
    --stream)
      STREAM="$2"
      shift 2
      ;;
    --namespace)
      NAMESPACE="$2"
      shift 2
      ;;
    --job-name)
      JOB_NAME="$2"
      shift 2
      ;;
    --prompt)
      PROMPT="$2"
      shift 2
      ;;
    --fast-mode)
      FAST_MODE="true"
      shift
      ;;
    --small-image)
      SMALL_IMAGE="true"
      shift
      ;;
    --no-tail)
      TAIL_LOGS="false"
      shift
      ;;
    --keep-job)
      KEEP_JOB="true"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

PAYLOAD_JSON=$(python3 - "$PROMPT" "$FAST_MODE" "$SMALL_IMAGE" <<'PY'
import json
import sys

prompt = sys.argv[1]
fast = sys.argv[2].lower() == "true"
small = sys.argv[3].lower() == "true"

payload = {
    "prompt": prompt,
    "fast_mode": fast,
    "small_image": small
}

print(json.dumps(payload))
PY
)

PAYLOAD_B64=$(printf '%s' "$PAYLOAD_JSON" | base64 | tr -d '\n')

cleanup() {
  if [[ "$KEEP_JOB" != "true" ]]; then
    kubectl delete job "$JOB_NAME" -n "$NAMESPACE" --ignore-not-found >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT

echo "🚀 Creating NATS bench job '$JOB_NAME' in namespace '$NAMESPACE'"
echo "🧹 Removing previous job instance (if any)..."
kubectl delete job "$JOB_NAME" -n "$NAMESPACE" --ignore-not-found >/dev/null 2>&1 || true

cat <<EOF | kubectl apply -n "$NAMESPACE" -f -
apiVersion: batch/v1
kind: Job
metadata:
  name: $JOB_NAME
spec:
  backoffLimit: 0
  template:
    metadata:
      labels:
        app: $JOB_NAME
    spec:
      restartPolicy: Never
      containers:
        - name: nats-bench
          image: ghcr.io/nats-io/nats-box:latest
          env:
            - name: NATS_SERVER
              value: "$SERVER"
            - name: NATS_SUBJECT
              value: "$SUBJECT"
            - name: NATS_STREAM
              value: "$STREAM"
            - name: NATS_MESSAGES
              value: "$MESSAGES"
            - name: NATS_CLIENTS
              value: "$CLIENTS"
            - name: NATS_BATCH
              value: "$BATCH"
            - name: PAYLOAD_B64
              value: "$PAYLOAD_B64"
          command:
            - /bin/sh
            - -c
            - |
              set -euo pipefail
              echo "$PAYLOAD_B64" | base64 -d > /tmp/payload.json
              echo "▶ Payload:"
              cat /tmp/payload.json
              nats bench js pub "$NATS_SUBJECT" \
                --stream "$NATS_STREAM" \
                --clients "$NATS_CLIENTS" \
                --msgs "$NATS_MESSAGES" \
                --batch "$NATS_BATCH" \
                --payload /tmp/payload.json \
                --server "$NATS_SERVER"
EOF

echo "⏳ Waiting for job completion..."
set +e
kubectl wait --for=condition=complete "job/$JOB_NAME" -n "$NAMESPACE" --timeout=15m
WAIT_STATUS=$?
set -e

if [[ "$TAIL_LOGS" == "true" ]]; then
  echo "📜 Streaming job logs (Ctrl+C to stop)..."
  kubectl logs -n "$NAMESPACE" "job/$JOB_NAME"
fi

if [[ $WAIT_STATUS -ne 0 ]]; then
  echo "⚠️ Job did not report completion within 15m. Inspect with:"
  echo "   kubectl describe job/$JOB_NAME -n $NAMESPACE"
  exit $WAIT_STATUS
fi

echo "✅ Queue load job finished."
if [[ "$KEEP_JOB" == "true" ]]; then
  echo "ℹ️ Job '$JOB_NAME' left in place (requested with --keep-job)."
fi
echo "📌 Next: monitor autoscalers via 'kubectl get hpa -n meme-generator --watch' and Grafana."
