# AI Agent Field Guide

This file is the canonical hand-off note for any AI agent picking up work on
this repository. Update it every time we complete a milestone or uncover a new
issue so the next agent can resume without interviewing humans.

---

- **Talk promise.** “Your autoscalers are fighting”—we have live chaos/harmony evidence and
  are adding custom metrics so HPA decisions follow business KPIs (Prometheus Adapter path).
- **Conflict baseline locked in.** Manual HPA + KEDA conflict run (2025-10-14 19:40–19:42 BST)
  produced the expected 10→10 replica tug-of-war with CPU saturation (`hpa-watch.log`,
  `results/hpa/conflict-hpa-snippet.txt`, `results/grafana/conflict-dashboard.png`).
- **Harmony story captured.** KEDA-only run (2025-10-18 00:12 BST) scaled smoothly from
  1→10 replicas and back with minimal oscillation; frontend HPA briefly scaled at k6 peak
  (`hpa-watch-harmony.log`, `results/hpa/harmony-hpa-snippet.txt`,
  `results/grafana/harmony-dashboard.png`, `results/k6-load-demo-harmony.json`).
- **Prometheus Adapter installed.** Helm release exposes `memegenerator_cpu_rate` under
  `custom.metrics.k8s.io/v1beta1`. APIService is healthy; query returns schema but no samples
  yet—Prometheus isn’t surfacing `container_cpu_usage_seconds_total` for namespace
  `meme-generator` (investigate scrape config / relabeling).
- **Tooling hardened.** `scripts/nats-queue-load.sh` runs conflict/harmony presets; dashboards are
  importable/renderable on demand; docs reference new workflows.

### Caveats & Unknowns
- Failure symptom log (events, pod churn) still needs to be curated for the conflict
  storyline.
- Grafana renders cover key windows but slide integration and annotations remain.
- Automatic toggle between conflict/harmony is still manual (`autoscaler-toggle.sh`);
  scripting/automation for live demo flip is pending.
- Prometheus Adapter exposes `memegenerator_cpu_rate` but the query currently returns an
  empty list because Prometheus drops `container_cpu_usage_seconds_total` samples when the
  `id`/`pod` labels are blank. Kubelet scrape (`prometheus-kube-prometheus-kubelet`
  ServiceMonitor) has a relabel rule `action: drop` on `id,pod`; adjust it (or add a
  dedicated ServiceMonitor) so pods in the `meme-generator` namespace keep those labels, or
  switch to a kube-state-metrics based metric (e.g. `kube_deployment_status_replicas`) for
  the demo. See immediate actions for details.
- Need to validate downscale timing post-harmony run once background pods settle.

_When you finish a task, refresh this section with bullet points summarising new
facts, blockers, or hand-offs._

---

## 2. Where To Find Plans & Context
- **High-level roadmap:** `docs/demo-roadmap.md` → phases M1-M5 with checklists and
  rehearsal notes. Update milestone status as work progresses.
- **Autoscaling runbook:** `docs/auto-scaling.md` → operational steps for HPA/KEDA/VPA,
  now including the queue load job instructions.
- **Load testing suite:** `k6/README.md` and `k6/run-tests.sh`; menu option 7 runs the
  new demo scenario. Raw outputs land in `k6/results/` (gitignored).
- **Stress toolbox:** `stress/README.md` describes both the Python burst script and the
  new Kubernetes Job launcher.
- **Infrastructure manifests:** `k8s/` base + overlays; conflict toggle script lives in
  `scripts/autoscaler-toggle.sh`.
- **Observability how-to:** `docs/observability-gke.md` → Grafana import steps,
  port-forwarding, dashboard IDs.

Before making changes, skim these docs to confirm assumptions and update them if
your work alters the flow.

---

## 3. Immediate Next Actions
1. **Custom metrics:** Finish Prometheus Adapter integration  
   - Current: chart exposes `memegenerator_cpu_rate`, APIService healthy, but
     `kubectl get --raw '/apis/custom.metrics.k8s.io/v1beta1/namespaces/meme-generator/pods/*/memegenerator_cpu_rate'`
     returns `items: []`. Kubelet scrape drops entries where `id`/`pod` labels are empty, so
     our containers disappear before recording.  
   - Options:  
     a) Patch `ServiceMonitor/prometheus-kube-prometheus-kubelet` to remove the
        `action: drop` relabel on `id,pod` for namespace `meme-generator`. One approach is to
        add an override ServiceMonitor in `k8s/monitoring/` that sets `sampleLimit: 0` and
        keeps the labels for our namespace.  
     b) Instead, source a metric from kube-state-metrics (e.g. `kube_deployment_status_replicas`
        or `kube_pod_container_resource_requests`) and update the adapter rule accordingly.  
   - Verify after adjustments with:  
     `kubectl get --raw '/apis/custom.metrics.k8s.io/v1beta1/namespaces/meme-generator/metrics/memegenerator_cpu_rate'` and pod-level query.  
   - Stretch: once data flows, wire an HPA to this metric for the demo.
2. **Narrative assets:** Embed/annotate Grafana PNGs (`results/grafana/*.png`) in slides/docs to
   illustrate “autoscalers fighting” vs “coordinated orchestra.”
3. **Failure symptoms:** Curate conflict evidence (events, pod churn, queue lag) and add snippets
   to `docs/demo-roadmap.md` / slide notes to dramatize Act 1.
4. **Demo script:** Draft spoken flow matching the abstract  
   *(Hook → Conflict demo → Harmony demo → Prometheus Adapter vision → Takeaways).* 

If commands cannot be executed (permissions/offline mode), note what was skipped,
why, and the prep work done instead (e.g., scripted instructions, dry runs).

---

## 4. Repository Conventions (Reference)
- **Structure:**  
  `services/backend/` Rust worker → helpers under `src/`, scripts in `scripts/`  
  `services/frontend/frontend/` React + Vite → components in `src/components`, state in
  `src/context`, generated assets under `dist/` (never edit)  
  `k8s/` base manifests + overlays (`local`, `gke`, `cloud`) → patch via overlays  
  `k6/` load testing → orchestrated via `run-tests.sh`  
  `infrastructure/` + `DEPLOYMENT.md` → Pulumi automation mirroring Skaffold profiles
- **Build/Test:** `skaffold dev --profile=local` for live dev; backend uses
  `cargo check/test/fmt/clippy`; frontend uses `npm ci && npm run {lint,build}`; images
  via `earthly +backend-docker` / `+frontend-docker`; performance via `./k6/run-tests.sh`
  with `BASE_URL` and `WS_URL`.
- **Style:** Rust → `rustfmt` defaults, instrument async flows with `tracing`. TS →
  2-space indent, kebab-case filenames (entrypoints exempt), hooks prefixed `use`. YAML →
  2-space indent, suffix env names (`-local.yaml`).
- **Testing:** Rust tests inline with `#[cfg(test)]`; frontend tests in
  `services/frontend/frontend/src/__tests__/` via Vitest; k6 smoke before infra changes;
  treat lint/fmt/clippy warnings as errors.
- **Commits/PRs:** Imperative ~72 char message; include context, solution, validation
  commands, deployment impact; flag follow-ups with unchecked boxes; keep overlays &
  Pulumi notes in sync for env changes.
- **Secrets:** Backend requires `HF_API_TOKEN`, `NATS_URL`, `REDIS_URL`; configure via
  Skaffold/Kubernetes secrets. Frontend runtime config generated from
  `services/frontend/entrypoint.sh` (`public/config.js` template). Update overlays +
  Pulumi stacks in lockstep when env vars change.

---

## 5. Maintaining This Guide
- Append new tooling, scripts, or dashboards you create and link to their docs.
- After each major session, update §1 (Current Situation) and adjust §3 (Immediate
  Next Actions) to reflect fresh priorities.
- If you discover stale instructions elsewhere, update both the original doc and this
  guide so future agents follow the corrected path.
