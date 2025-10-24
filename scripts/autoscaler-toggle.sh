#!/usr/bin/env bash
set -euo pipefail
ACTION=${1:-}
case "$ACTION" in
  chaos)
    echo "⚠️ Enabling chaos mode (conflicting triggers in single KEDA ScaledObject)"
    kubectl delete hpa meme-backend -n meme-generator --ignore-not-found
    kubectl delete scaledobject.keda.sh meme-backend -n meme-generator --ignore-not-found
    kubectl delete scaledobject.keda.sh meme-backend-chaos -n meme-generator --ignore-not-found
    kubectl delete scaledobject.keda.sh meme-backend-harmony -n meme-generator --ignore-not-found
    kubectl apply -f k8s/scenarios/backend-scaledobject-chaos.yaml
    ;;
  harmony)
    echo "🎼 Enabling harmony mode (productivity-based Prometheus trigger)"
    kubectl delete hpa meme-backend -n meme-generator --ignore-not-found
    kubectl delete scaledobject.keda.sh meme-backend -n meme-generator --ignore-not-found
    kubectl delete scaledobject.keda.sh meme-backend-chaos -n meme-generator --ignore-not-found
    kubectl delete scaledobject.keda.sh meme-backend-harmony -n meme-generator --ignore-not-found
    kubectl apply -f k8s/scenarios/backend-scaledobject-harmony.yaml
    ;;
  conflict)
    echo "🔄 Enabling HPA + KEDA conflict on meme-backend"
    kubectl delete hpa meme-backend -n meme-generator --ignore-not-found
    kubectl apply -f k8s/base/backend-keda-scaledobject.yaml
    kubectl apply -f k8s/base/backend-hpa.yaml
    ;;
  keda-only)
    echo "🔄 Enabling KEDA-only scaling (removing manual HPA)"
    kubectl delete hpa meme-backend -n meme-generator --ignore-not-found
    kubectl apply -f k8s/base/backend-keda-scaledobject.yaml
    ;;
  hpa-only|teardown)
    echo "🔄 Rolling back to manual HPA only"
    kubectl delete scaledobject.keda.sh meme-backend -n meme-generator --ignore-not-found
    kubectl apply -f k8s/base/backend-hpa.yaml
    ;;
  status)
    kubectl get hpa -n meme-generator
    kubectl get scaledobject.keda.sh -n meme-generator || true
    exit 0
    ;;
  *)
    cat <<USAGE
Usage: $0 {chaos|harmony|conflict|keda-only|hpa-only|teardown|status}
  chaos      - single KEDA ScaledObject with conflicting triggers (demo the fight)
  harmony    - KEDA ScaledObject using Prometheus productivity metric
  conflict   - ensure both base KEDA ScaledObject and manual HPA exist
  keda-only  - remove manual HPA and rely on base KEDA ScaledObject
  hpa-only   - disable KEDA and ensure manual HPA exists
  teardown   - alias for hpa-only
  status     - show autoscaler objects
USAGE
    exit 1
    ;;
esac

kubectl get hpa -n meme-generator
kubectl get scaledobject.keda.sh -n meme-generator || true
