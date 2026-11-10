# Reproducible demo

This walkthrough uses **synthetic telemetry only**. No corporate API, production JWT or AI API key is needed.

## Prepare the demo

With PostgreSQL running and `backend/.env` configured, run from `backend`:

```bash
npm run demo:seed
npm run demo:evaluate
```

The seed replaces events and analyses **only** in the reserved `ai-diagnostics-showcase` project. It refuses to proceed if unexpected services or connectors exist there. It does not touch other projects or Docker volumes. The evaluator checks counts and evidence IDs without an LLM.

## Walkthrough

1. Open `http://127.0.0.1:5173`, refresh and select **AI Diagnostics — Demonstração**.
2. Set **Last 14 days**. A freshly seeded demo project should show **150 executions and 29 failures**.
3. Open **Checkout API**: observe rate limiting, server errors and a rising failure rate.
4. Open **Catalog API**: a healthy baseline without fabricated anomalies.
5. Open **Search API**: elevated average latency with successful HTTP responses.
6. Open **Background Jobs**: failures without HTTP status, elevated latency and an increasing failure trend.
7. Inspect **Evidências observadas** in each service; these findings are deterministic.
8. Optionally run **Analisar com IA** with a configured provider for real, non-pre-recorded interpretations.

## Expected findings

| Scenario | Events | Failures | Evidence IDs |
|---|---:|---:|---|
| Checkout API | 48 | 20 | `EV-BASE`, `EV-429`, `EV-5XX`, `EV-TREND` |
| Catalog API | 40 | 0 | `EV-BASE` |
| Search API | 32 | 0 | `EV-BASE`, `EV-LATENCY` |
| Background Jobs | 30 | 9 | `EV-BASE`, `EV-TIMEOUT`, `EV-LATENCY`, `EV-TREND` |

Timestamps are relative to the seed time. Re-running the seed refreshes them so the demonstration does not go stale. The expected totals refer to the reserved demo project, not **All projects**.

## Optional real LLM evaluation

```bash
npm run demo:evaluate -- --llm
```

The flag calls the configured provider, validates output structure and evidence references, and saves analyses in history. This consumes real provider requests and may incur usage limits/costs. It is **not** a model accuracy benchmark and does not prove incident root causes.

## Short video outline

Show the four services, open Checkout API, explain deterministic evidence and optionally run a model analysis. Close with the automated test/evaluation commands. Label the telemetry as synthetic and distinguish hypotheses from confirmed facts.
