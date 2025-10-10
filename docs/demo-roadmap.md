# Demo Roadmap: Autoscaler Harmony

## Vision & Goals
- **Primary goal**: Deliver a live demo showing HPA, VPA, and KEDA acting in concert on the meme-generator stack.
- **Supporting goals**: (1) Expose chaotic baseline, (2) establish unified observability, (3) execute tuned orchestration run, (4) publish repeatable runbook.

## Milestones
| ID | Description | Status |
|----|-------------|--------|
| M1 | Environment baseline verified | Completed |
| M2 | Observability stack ready | In Progress |
| M3 | Conflict scenario scripted | Planned |
| M4 | Coordinated scaling delivered | Planned |
| M5 | Demo runbook finalized | Planned |

## Pre-Demo Infrastructure Checklist
- [ ] Provision `meme-demo` GKE cluster (scaleops-dev-rel) with 2 → 4 node autoscaling.
- [ ] Enable required addons (HorizontalPodAutoscaling, HttpLoadBalancing, Cloud Logging) and IP aliasing.
- [ ] Pull cluster credentials locally (`gcloud container clusters get-credentials meme-demo --region us-central1`).
- [ ] Verify baseline (`kubectl get nodes`, `kubectl get namespace meme-generator` after deploy).

## Execution Phases

### Phase 1 – Baseline Validation → M1 *(Completed)*
- [x] Render Skaffold manifests (`skaffold render --profile=gke`) and confirm HPA/VPA/KEDA specs.
- [x] Audit `k8s/overlays/gke` quotas and autoscaler limits; align resource envelopes.
- [x] Verify `HF_API_TOKEN`, `NATS_URL`, `REDIS_URL` secrets exist in the target namespace.

**Findings & Follow-ups**
- Backend/frontend VPAs and the KEDA ScaledObject are missing from the repo—add manifests to include in future renders.
- Replace dummy secret values during deployment; document secure injection.

### Phase 2 – Observability Foundations → M2 *(In Progress)*
- [ ] Confirm Prometheus scrapes backend `:9090`; add ServiceMonitor if missing.
- [ ] Ensure kube-state-metrics, metrics-server, and VPA controllers are healthy.
- [ ] Build Grafana dashboards for HPA signals, VPA recommendations, KEDA queue depth, meme latency.
- [x] Document monitoring install steps (Helm/kustomize) for GKE demo cluster.

**Progress & Follow-ups**
- Added service labels and `k8s/monitoring/backend-servicemonitor.yaml` to formalize scraping; need to validate once deployed.
- Created backend VPA/KEDA manifests (`k8s/base/backend-vpa.yaml`, `k8s/base/backend-keda-scaledobject.yaml`) so Skaffold renders the full autoscaler trio.
- Authored `docs/observability-gke.md` with Helm install sequence for kube-prometheus-stack, KEDA, and VPA on GKE.

### Phase 3 – Chaos Scenario → M3 *(Planned)*
- [ ] Parameterize k6 scripts for CPU/memory spikes and queue backlogs; document commands.
- [ ] Dry-run load tests; capture Grafana "before" snapshots showing conflict.
- [ ] Log failure symptoms (pod churn, oscillation, SLA breaches) for the talk narrative.

### Phase 4 – Harmony Implementation → M4 *(Planned)*
- [ ] Wire custom metrics into HPA (queue depth per pod, meme latency histogram).
- [ ] Tune VPA stabilization windows and KEDA cooldown/thresholds.
- [ ] Redeploy (`skaffold run --profile=gke --tail`); rerun k6 scenario; capture "after" dashboards.

### Phase 5 – Runbook & Rehearsal → M5 *(Planned)*
- [ ] Draft demo script: timing, terminal layout, Grafana panels, meme transitions.
- [ ] Package reset automation to clear autoscalers and redeploy baseline state.
- [ ] Conduct full rehearsal; export dashboards/video; update this roadmap with outcomes.

## Check-ins & Notes
- Daily 5-minute sync to update milestones and flag blockers.
- Record rehearsal retrospectives below to track improvements.

> Add entries here after each rehearsal with findings, fixes, and outstanding risks.
