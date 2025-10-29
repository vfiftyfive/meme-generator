# AI Agent Field Guide

This file is the canonical hand-off note for any AI agent picking up work on
this repository. Update it every time we complete a milestone or uncover a new
issue so the next agent can resume without interviewing humans.

---
## 1. Current Situation (Rolling Update)
- **Talk promise.** “Your autoscalers are fighting”—we have live chaos/harmony evidence and
  are adding custom metrics so HPA decisions follow business KPIs (Prometheus Adapter path).
- **Conflict baseline locked in.** Manual HPA + KEDA conflict run (2025-10-14 19:40–19:42 BST)
  produced the expected 10→10 replica tug-of-war with CPU saturation (`hpa-watch.log`,
  `results/hpa/conflict-hpa-snippet.txt`, `results/grafana/conflict-dashboard.png`).
- **Harmony story captured.** KEDA-only run (2025-10-18 00:12 BST) scaled smoothly from
  1→10 replicas and back with minimal oscillation; frontend HPA briefly scaled at k6 peak
  (`hpa-watch-harmony.log`, `results/hpa/harmony-hpa-snippet.txt`,
  `results/grafana/harmony-dashboard.png`, `results/k6-load-demo-harmony.json`).
- **Prometheus Adapter integrated.** Helm release exposes both `memegenerator_pod_cpu_rate` and
  the new translator metric `memegenerator_pod_productivity` (`results/hpa/harmony-memegenerator-productivity.json`).
  The manual HPA consumes the CPU rate; the harmony KEDA ScaledObject consumes productivity via Prometheus trigger.
- **Conflict evidence refreshed.** Latest chaos burst captured in `results/hpa/conflict-{...}` plus
  `results/hpa/conflict-jetstream-pending.json` (Prometheus exporter) and Grafana PNGs.
- **Tooling hardened.** `scripts/nats-queue-load.sh` runs conflict/harmony presets; dashboards are
  importable/renderable on demand; docs reference new workflows. Prometheus now scrapes JetStream via the
  `prometheus-nats-exporter` deployment (`k8s/monitoring/prometheus-nats-exporter.yaml`).
- **Context discipline.** Always switch to `gke_scaleops-dev-rel_us-central1-a_meme-demo` (`kubectl config use-context ...`) before
  applying manifests or Helm upgrades; other contexts on this machine point to unrelated clusters.

### Caveats & Unknowns
- Failure symptom log (events, pod churn) still needs to be curated for the conflict
  storyline.
- Grafana renders cover key windows but slide integration and annotations remain.
- `scripts/autoscaler-toggle.sh` now supports `chaos`, `harmony`, `conflict`, `keda-only`, and `hpa-only`.
  Always reset to `hpa-only` when you’re done rehearsing.
- `memegenerator_pod_cpu_rate` stays `0` when idle but jumps under load (peaks ~30–90 m). Target sits at `20m`.
  Productivity metric is namespace-scoped—query with:
  `kubectl get --raw '/apis/custom.metrics.k8s.io/v1beta1/namespaces/meme-generator/metrics/memegenerator_pod_productivity'`.

_When you finish a task, refresh this section with bullet points summarising new
facts, blockers, or hand-offs._

---

## 2. Where To Find Plans & Context
- **High-level roadmap:** `docs/demo-roadmap.md` → phases M1-M5 with checklists and
  rehearsal notes. Update milestone status as work progresses.
- **Autoscaling runbook:** `docs/auto-scaling.md` → operational steps for HPA/KEDA, custom metrics,
  and load jobs (plus future VPA notes).
- **Load testing suite:** `k6/README.md` and `k6/run-tests.sh`; menu option 7 runs the
  new demo scenario. Raw outputs land in `k6/results/` (gitignored).
- **Stress toolbox:** `stress/README.md` describes both the Python burst script and the
  new Kubernetes Job launcher.
- **Infrastructure manifests:** `k8s/` base + overlays; conflict toggle script lives in
  `scripts/autoscaler-toggle.sh`.
- **Observability how-to:** `docs/observability-gke.md` → Grafana import steps,
  port-forwarding, dashboard IDs.
- **Demo script:** `docs/demo-script.md` → running order, live commands, reset checklist.

Before making changes, skim these docs to confirm assumptions and update them if
your work alters the flow.

---

## 3. Immediate Next Actions
1. **Harmony evidence:** Fold new productivity metrics (`results/hpa/harmony-*.{txt,json}`) into slides/docs
   so the translator story is front-and-center.
2. **Conflict visuals:** Incorporate latest chaos snapshots/logs (`results/hpa/conflict-*`) + CPU throttling panel
   screenshots (`results/grafana/chaos-*.png`) into slides; highlight the “lie” vs ground truth.
3. **Narrative assets:** Embed/annotate Grafana PNGs (`results/grafana/*.png`) showing pod count, queue lag,
   throttling, and productivity harmony.
4. **Failure symptoms:** Pull talking points from `results/hpa/conflict-*` + throttling metrics into speaker notes.
5. **Demo script review:** Walk stakeholders through `docs/demo-script.md`; capture feedback and integrate into slides.

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
