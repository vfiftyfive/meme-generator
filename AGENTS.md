# AI Agent Field Guide

This file is the canonical hand-off note for any AI agent picking up work on
this repository. Update it every time we complete a milestone or uncover a new
issue so the next agent can resume without interviewing humans.

---

## 1. Current Situation (Rolling Update)
- Conflict run (manual HPA + KEDA) succeeded on 2025-10-14 19:40–19:42 BST: queue load
  pushed the metric to `6k/5`, manual HPA escalated to 10 replicas, and KEDA’s HPA chased
  to 10/10 (`hpa-watch.log` records the fight).
- Harmony run (KEDA-only) succeeded on 2025-10-14 20:59–21:02 BST: JetStream queue load
  via `nats-queue-load.sh --messages 20000 --clients 80` nudged `keda-hpa-meme-backend`
  to 2 replicas (`3500m/5`) before draining calmly; frontend HPA stayed at 1 pod until
  the subsequent k6 demo at 21:24 BST, where it scaled to two pods (cpu 43 %/30 %).
- `scripts/nats-queue-load.sh` now pulls the NATS CLI and uses `nats bench js pub sync`
  so messages land in JetStream; latest job `nats-queue-load-qlx5p` is `Completed`.
- Grafana screenshots still outstanding: capture conflict (≈19:39–19:43 BST) and harmony
  (≈21:24–21:28 BST) windows once you have UI access.
- `hpa-watch.log` contains both conflict and harmony traces; watcher stopped after
  21:27 BST (PID cleaned up).

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
1. Capture visuals: export Grafana autoscaling dashboard screenshots for conflict
   (≈19:39–19:43 BST) and harmony (≈21:24–21:28 BST) windows.
2. Archive console evidence: trim `hpa-watch.log` to handy snippets, persist relevant
   `kubectl get hpa` snapshots, and store the latest k6 output under `k6/results/`.
3. Plan the harmony narrative: document in `docs/demo-roadmap.md` the contrast between
   conflict (manual HPA vs KEDA tug-of-war) and harmony (KEDA-only scaling to 2 pods),
   then script the resolution toggle (`./scripts/autoscaler-toggle.sh hpa-only`) for
   demo day reset.

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
