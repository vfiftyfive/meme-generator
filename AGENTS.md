# AI Agent Field Guide

This file is the canonical hand-off note for any AI agent picking up work on
this repository. Update it every time we complete a milestone or uncover a new
issue so the next agent can resume without interviewing humans.

---

## 1. Current Situation (Rolling Update)
- Conflict run (manual HPA + KEDA) succeeded on 2025-10-14 19:40–19:42 BST: queue load
  pushed the metric to `6k/5`, manual HPA escalated to 10 replicas, and KEDA’s HPA chased
  to 10/10 (`hpa-watch.log` records the fight).
- Harmony run (KEDA-only) succeeded on 2025-10-18 00:12 BST: queue load via
  `scripts/nats-queue-load.sh --messages 6000 --clients 60` (and a follow-up 4k/40 run)
  drove `keda-hpa-meme-backend` to 10 replicas without the manual HPA (`hpa-watch-harmony.log:567`
  and `kubectl describe hpa` events show 1→4→8→10 scaling).
- Frontend HPA reacted during both demo loads: conflict run hit cpu 44 %/30 % with two
  replicas; harmony run showed cpu 11 %/30 % at 00:05 BST before scaling back down
  (`hpa-watch-harmony.log:505` onwards).
- `scripts/nats-queue-load.sh` now uses an Alpine pod that downloads the NATS CLI, so
  load jobs run inside the cluster without GHCR pulls; latest jobs (`nats-queue-load-5n6wr`,
  `nats-queue-load-pqm6z`) completed successfully.
- Grafana screenshots still outstanding: capture conflict (≈19:39–19:43 BST) and harmony
  (≈00:05–00:13 BST) windows for the autoscaling dashboard.

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
1. Capture Grafana autoscaling dashboard screenshots for conflict (≈19:39–19:43 BST) and
   harmony (≈00:05–00:13 BST) windows and link them in the demo materials.
2. Archive console evidence: trim `hpa-watch.log` / `hpa-watch-harmony.log`, export
   `kubectl describe hpa` snippets, and stash the latest k6 JSON (if long-term tracking
   is required) under `k6/results/`.
3. Script the harmony narrative in `docs/demo-roadmap.md`: highlight the manual HPA vs
   KEDA tug-of-war, the KEDA-only scaling curve, and outline how to flip between
   `./scripts/autoscaler-toggle.sh conflict` ↔ `keda-only` during the demo.

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
