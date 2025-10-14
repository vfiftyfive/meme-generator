# AI Agent Field Guide

This file is the canonical hand-off note for any AI agent picking up work on
this repository. Update it every time we complete a milestone or uncover a new
issue so the next agent can resume without interviewing humans.

---

## 1. Current Situation (Rolling Update)
- Conflict run succeeded on 2025-10-14 19:40–19:42 BST: queue load job pushed the KEDA
  metric to `6k/5`, manual HPA drove the backend to 10 replicas, and KEDA’s HPA tracked
  10/10 shortly afterward (`hpa-watch.log` captures the sequence).
- Frontend HPA reacted during the k6 demo load at 20:07 BST, scaling to two pods with
  CPU 44 %/30 % while backend settled back to a single replica.
- `scripts/nats-queue-load.sh` now uses `alpine` + GitHub NATS CLI download, so the job
  runs inside the cluster without GHCR pulls; latest pod `nats-queue-load-52qf9` is
  `Completed` and can be deleted once artifacts are gathered.
- Grafana screenshots of the conflict window still needed; set dashboard time range to
  19:39–19:43 BST for the fight and 20:06–20:10 BST for the frontend spike.
- `hpa-watch.log` currently includes both the conflict spike and the frontend ramp; the
  watcher is in the background (PID in `hpa-watch.pid`).

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
1. Capture visuals: open Grafana autoscaling dashboard, set range to the conflict window
   (≈19:39–19:43 BST) and the frontend spike (≈20:06–20:10 BST), and export screenshots
   for the demo deck.
2. Archive metrics: clip the relevant `hpa-watch.log` segments, collect `kubectl get hpa`
   snapshots, and stash k6 summary/output under `k6/results/` if long-term storage is
   required.
3. Prep harmony rehearsal: decide on conflict resolution toggle (e.g., `./scripts/autoscaler-toggle.sh keda-only`),
   rerun queue + k6 load, and document the “after” state in `docs/demo-roadmap.md`.

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
