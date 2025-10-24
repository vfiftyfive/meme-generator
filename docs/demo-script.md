# Demo Script – Autoscalers: Conflict vs Harmony

> Working draft for presenters. Tailor timing (≈8 minutes) and adjust live commentary after each rehearsal.

## 0. Setup (Backstage)
- Ensure `./scripts/autoscaler-toggle.sh hpa-only` applied, pods at 1, Grafana dashboards loaded (conflict + harmony tabs), and terminal panes split (watch pods, custom metric curl, load generator).
- Preload commands:
  - `watch -n 2 kubectl get hpa -n meme-generator`
  - `kubectl get --raw '/apis/custom.metrics.k8s.io/v1beta1/namespaces/meme-generator/metrics/memegenerator_pod_productivity'`
  - `./scripts/nats-queue-load.sh --messages 6000 --clients 60`
  - `./scripts/nats-queue-load.sh --messages 4000 --clients 40`

## 1. Hook (0:00–0:45)
- **Narration (keep it conversational):**
  - “Imagine two coaches shouting different plays at the same team—that’s our autoscaling story tonight.”
  - “KEDA is listening to two masters—queue lag and average CPU—and the result is chaos.”
- **Visual:** flash `results/grafana/conflict-dashboard.png` (or live dashboard) and trace the jagged replica line plus 90%+ CPU plateau.
- **Set the promise:** “We’re going to turn that chaos into a coordinated orchestra by feeding the HPA a business-aware metric via the Prometheus Adapter.”

## 2. Act I – Conflict (0:45–3:00)
1. **Stage the fight**
   - Run `./scripts/autoscaler-toggle.sh chaos`.
   - Say: “KEDA now has two conflicting triggers in one ScaledObject—queue lag says ‘add pods’, fake average CPU says ‘remove pods’.”
2. **Trigger pressure**
   - Execute `./scripts/nats-queue-load.sh --messages 6000 --clients 60`.
   - Mention: “This is a JetStream burst—6,000 meme requests to spike the queue.”
3. **Narrate symptoms while the command runs**
   - Terminal window with `watch -n 2 kubectl get hpa -n meme-generator`: point at the KEDA-generated HPA swinging rapidly.
   - Optional live describe: `kubectl describe hpa keda-hpa-meme-backend-chaos -n meme-generator` (highlights repeated rescale events—mirrors `results/hpa/conflict-keda-hpa-describe.txt`).
   - Pod churn: `kubectl get pods -n meme-generator -l app=meme-backend -w`; reference pre-captured `results/hpa/conflict-current-pods.txt`.
4. **Call out failure symptoms**
   - “Queue lag shoots up because both autoscalers over-correct.”
   - “Average CPU looks safe (~50%), but the CPU throttling panel is screaming—this is the lie.”
   - “Pods churn between 1 and 10; we burn CPU just fighting ourselves.”
5. **Close Act I**
   - “We’ve proven the problem: without a shared KPI, the team fights itself.”

## 3. Act II – Harmony (3:00–6:00)
1. **Reset the stage**
   - Run `./scripts/autoscaler-toggle.sh harmony`.
   - Narrate: “We replaced the conflicting triggers with a single Prometheus trigger that listens to productivity—messages per CPU-second.”
2. **Explain the custom metric**
   - “Prometheus Adapter now exposes `memegenerator_pod_productivity` so KEDA and the HPA speak the same language.”
   - Show the JSON output (`kubectl get --raw '/apis/custom.metrics.k8s.io/v1beta1/namespaces/meme-generator/metrics/memegenerator_pod_productivity'`).
3. **Run the harmony load**
   - `./scripts/nats-queue-load.sh --messages 4000 --clients 40`.
   - Call out: “Same JetStream queue, but watch how the pods scale intentionally.”
4. **Narrate the smooth scaling**
   - Show Grafana `results/grafana/harmony-dashboard.png`.
   - Highlight that pods climb to 10 and return to 1 without oscillation, referencing `results/hpa/harmony-memegenerator-pod-metric-peak.json`.
5. **Contrast with conflict**
   - “Same traffic, but now the HPA listens to the KPI we care about—no tug-of-war, faster recovery.”

## 4. Vision – Business KPIs Everywhere (6:00–7:15)
- Talking points:
  - “Any metric you can scrape can become an autoscaler trigger—queue depth, SLA latency, conversions per minute.”
  - “Prometheus Adapter acts as the translator, so we can add signals without rewriting the scaler.”
  - “Next steps: apply the same idea to VPA recommendations or to alerting dashboards.”

## 5. Takeaways & Call-to-Action (7:15–8:00)
- Scripted close:
  - “Autoscalers aren’t magic—they’re only as smart as the signals we give them.”
  - “In conflict mode, CPU and queue lag fought. In harmony mode, we fed the HPA a KPI: pod productivity.”
  - “Everything we showed is documented—see `docs/auto-scaling.md`, `docs/testing.md`, and this script.”
- Leave the harmony dashboard up while taking questions.

## Appendix – Reset Steps
1. `./scripts/autoscaler-toggle.sh hpa-only`
2. `kubectl delete job nats-queue-load -n meme-generator --ignore-not-found`
3. Confirm `kubectl get pods -n meme-generator -l app=meme-backend`
