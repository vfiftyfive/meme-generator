# Demo Roadmap: Autoscaler Harmony

## Vision & Goals
- **Primary goal**: Deliver a live demo showing HPA, VPA, and KEDA acting in concert on the meme-generator stack.
- **Supporting goals**: (1) Expose chaotic baseline, (2) establish unified observability, (3) execute tuned orchestration run, (4) publish repeatable runbook.

## Milestones
| ID | Description | Status |
|----|-------------|--------|
| M1 | Environment baseline verified | Completed |
| M2 | Observability stack ready | Completed |
| M3 | Conflict scenario scripted | Planned |
| M4 | Coordinated scaling delivered | Planned |
| M5 | Demo runbook finalized | Planned |

## Pre-Demo Infrastructure Checklist
- [x] Provision `meme-demo` GKE cluster (scaleops-dev-rel) with 2 → 4 node autoscaling.
- [x] Enable required addons (HorizontalPodAutoscaling, HttpLoadBalancing, Cloud Logging) and IP aliasing.
- [x] Pull cluster credentials locally (`gcloud container clusters get-credentials meme-demo --region us-central1`).
- [x] Verify baseline (`kubectl get nodes`, `kubectl get namespace meme-generator` after deploy).

> Current cluster runs zonally in `us-central1-a` so the starting node count remains two.

## Execution Phases

### Phase 1 – Baseline Validation → M1 *(Completed)*
- [x] Render Skaffold manifests (`skaffold render --profile=gke`) and confirm HPA/VPA/KEDA specs.
- [x] Audit `k8s/overlays/gke` quotas and autoscaler limits; align resource envelopes.
- [x] Verify `HF_API_TOKEN`, `NATS_URL`, `REDIS_URL` secrets exist in the target namespace.

**Findings & Follow-ups**
- Backend/frontend VPAs and the KEDA ScaledObject are missing from the repo—add manifests to include in future renders.
- Replace dummy secret values during deployment; document secure injection.

### Phase 2 – Observability Foundations → M2 *(Completed)*
- [x] Confirm Prometheus scrapes backend `:9090`; add ServiceMonitor if missing.
- [x] Ensure kube-state-metrics, metrics-server, and VPA controllers are healthy.
- [x] Build Grafana dashboards for HPA signals, VPA recommendations, KEDA queue depth, meme latency.
- [x] Document monitoring install steps (Helm/kustomize) for GKE demo cluster.

**Progress & Follow-ups**
- Added service labels and `k8s/monitoring/backend-servicemonitor.yaml` to formalize scraping (validated live: `up{job="meme-backend"}=1`).
- Created backend VPA/KEDA manifests (`k8s/base/backend-vpa.yaml`, `k8s/base/backend-keda-scaledobject.yaml`) so Skaffold renders the full autoscaler trio.
- Authored `docs/observability-gke.md` with Helm install sequence for kube-prometheus-stack, KEDA, and VPA on GKE.
- Deployed kube-prometheus-stack, KEDA, and VPA controllers on `meme-demo`; generated TLS material for `vpa-tls-certs` so the admission controller now runs.
- Applied base workloads (NATS, Redis, backend, frontend) and confirmed Prometheus is scraping the backend (`up{job="meme-backend"} == 1`).
- Imported `k8s/monitoring/complete-dashboard.json` into Grafana; panels are ready for chaos screenshots.
- Stood up GCE HTTPS ingress with `/` and `/ws` routing through the nginx proxy (`nats-websocket-proxy`) and verified DNS + managed cert are live.
- Replaced the direct NATS endpoint with a WebSocket-aware proxy (`nats-websocket-proxy` Deployment + health checks) so Cloud LB health probes pass and browsers reach `wss://meme-generator.scaleops-labs.dev/ws` successfully.
- Provisioned GCE HTTPS ingress for `meme-generator.scaleops-labs.dev` with path-based routing (ManagedCertificate still provisioning).
- Created KEDA ScaledObject `meme-backend` (reintroducing the manual HPA afterward) so both HPAs now coexist for the conflict demo.
- Ran k6 smoke test against the port-forwarded frontend (results in `k6/results/smoke.json`) to validate the baseline stack before chaos tuning.
- Reconfigured the backend default Hugging Face endpoint to the router/FLUX model (`HF_API_URL`), and validated end-to-end generation via direct NATS publish/subscription (base64 payload confirmed on `meme.response`).
- Rotated the `HF_API_TOKEN` secret to the live key and restarted the backend; Hugging Face requests now return 200s (402s resolved).
- Added lightweight Redis deployment (`k8s/cache/simple-redis.yaml`) for the demo cluster to avoid private Bitnami image pulls.

### Phase 3 – Chaos Scenario → M3 *(Planned)*
- [ ] Automate conflict toggle (delete/recreate backend HPA while applying KEDA ScaledObject) so the demo can flip between "fight" and "harmony" modes live.
- [x] Parameterize k6 scripts for CPU/memory spikes and queue backlogs; document commands.
- [x] Dry-run load tests (queue load + demo k6) to provoke conflict; metrics recorded in `hpa-watch.log`.
- [ ] Capture Grafana "before" snapshots showing conflict (target range 19:39–19:43 BST).
- [ ] Log failure symptoms (pod churn, oscillation, SLA breaches) for the talk narrative.

**Progress & Follow-ups**
- Added `k6/scenarios/2-load-demo.js` plus runner menu option for the 6-minute conflict rehearsal.
- Authored `scripts/nats-queue-load.sh` to launch in-cluster `nats bench` jobs; documented usage in `docs/auto-scaling.md` and `stress/README.md`.
- Conducted 2025-10-14 conflict run: `nats-queue-load` hit 10 backend replicas, manual HPA pegged CPU 93 %/50 %, frontend stayed at 1 pod until k6 ramp.
- Conducted 2025-10-18 harmony run (KEDA-only): JetStream load scaled backend 1→4→8→10 replicas per `kubectl describe hpa`; frontend only scaled during the k6 rehearsal.
- Next action: capture Grafana before/after panels and annotate failure symptoms for the narrative.

### Phase 4 – Harmony Implementation → M4 *(Planned)*
- [ ] Wire custom metrics into HPA (queue depth per pod, meme latency histogram).
- [ ] Tune VPA stabilization windows and KEDA cooldown/thresholds.
- [ ] Redeploy (`skaffold run --profile=gke --tail`); rerun k6 scenario; capture "after" dashboards.

**Progress & Follow-ups**
- Ran KEDA-only harmony rehearsal (2025-10-18 00:12 BST): queue load drove `keda-hpa-meme-backend`
  to 10 replicas without manual HPA intervention; backend downscales after cooldown while frontend
  stabilises at two pods during the k6 demo load.
- Still need Grafana "after" panels and narrative comparing conflict vs harmony scaling curves.

### Phase 5 – Runbook & Rehearsal → M5 *(Planned)*
- [ ] Draft demo script: timing, terminal layout, Grafana panels, meme transitions.
- [ ] Package reset automation to clear autoscalers and redeploy baseline state.
- [ ] Conduct full rehearsal; export dashboards/video; update this roadmap with outcomes.

## Check-ins & Notes
- Daily 5-minute sync to update milestones and flag blockers.
- Record rehearsal retrospectives below to track improvements.

> Add entries here after each rehearsal with findings, fixes, and outstanding risks.
