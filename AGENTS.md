# Repository Guidelines

## Project Structure & Module Organization
- `services/backend/`: Rust worker bridging NATS and Redis; keep helpers in modules under `src/` and scripts in `scripts/`.
- `services/frontend/frontend/`: React + Vite UI; components in `src/components`, state in `src/context`, generated assets in `dist/` (never edit manually).
- `k8s/`: base manifests plus overlays (`local`, `gke`, `cloud`); patch via overlays rather than editing base definitions directly.
- `k6/`: load-testing scripts orchestrated by `run-tests.sh`; outputs inform reviews.
- `infrastructure/` + `DEPLOYMENT.md`: Pulumi automation and rollout notes mirroring Skaffold profile names.

## Build, Test, and Development Commands
- `skaffold dev --profile=local` runs the stack with file sync; use `skaffold run --profile=gke` or `--profile=cloud` for cluster deploys.
- Backend: `cargo check`, `cargo test`, and `cargo fmt --check && cargo clippy -- -D warnings` gate Rust merges.
- Frontend: from `services/frontend/frontend`, run `npm ci`, `npm run dev`, `npm run build`, and `npm run lint` for static analysis.
- Images: `earthly +backend-docker` / `earthly +frontend-docker` build images; append `--platform=linux/amd64,linux/arm64` for multi-arch targets.
- Performance: `./k6/run-tests.sh` selects smoke/load/stress plans; set `BASE_URL` first.

## Coding Style & Naming Conventions
- Rust: `rustfmt` defaults (4-space indents, snake_case modules, PascalCase types); instrument async flows with `tracing` spans.
- TypeScript: 2-space indents, kebab-case filenames except entry points, hooks prefixed with `use`; keep theme tokens centralized in `App.tsx`.
- YAML/Helm/Kustomize: 2-space indents and environment suffixes such as `-local.yaml`.

## Testing Guidelines
- Place Rust unit tests alongside modules with `#[cfg(test)]`, naming suites after behaviour (`handles_missing_cache_entry`).
- Frontend tests belong in `src/__tests__/` using Vitest; assert component contracts over snapshots.
- Run the k6 smoke scenario before infra changes and attach the metrics summary in the PR.
- Treat lint, fmt, and clippy warnings as failures; justify any exceptions in the PR.
- Validate every completed step by running the relevant unit, integration, or load tests before moving on.

## Commit & Pull Request Guidelines
- Commits: imperative, ~72 characters, e.g., `Add k6 spike scenario`; group related changes and reference tickets in the footer (`Refs #123`).
- Pull requests include context, solution, validation steps (commands or screenshots), and deployment impact (`skaffold`, `earthly`, secrets).
- Flag follow-up work with unchecked task boxes and document configuration changes in both overlays and Pulumi notes.

## Environment & Secrets
- Backend requires `HF_API_TOKEN`, `NATS_URL`, `REDIS_URL`; inject via Skaffold profiles or Kubernetes secrets, not hardcoded defaults.
- Frontend runtime config comes from `public/config.js` templated by `services/frontend/entrypoint.sh`; never commit resolved values.
- Update overlays and Pulumi stacks together whenever environment variables change to keep clusters consistent.
