# Architecture

## Goal

Collect telemetry from heterogeneous services and provide diagnoses grounded in verifiable observations. Numerical facts and incident hypotheses are deliberately separated: the backend computes metrics; the language model suggests what may warrant investigation.

## Components

1. **React UI:** projects, services, HTTP connectors, dashboards, evidence and analysis history.
2. **Express API:** REST endpoints, Zod validation, a management key for write operations and predictable errors.
3. **Connectors:** read-only GET, Bearer or API-key authentication, bounded pagination and configurable JSON mapping. `HTTP_CHECK` measures observed availability; `JSON_LOGS` imports events.
4. **PostgreSQL:** projects, services, events, analyses, connectors and synchronization records.
5. **Deterministic engine:** SQL aggregates rates, durations, HTTP errors and time windows; rules assign stable evidence IDs.
6. **Optional LLM:** Groq, Gemini or Ollama adapters; JSON schema, reference integrity and free-text numeric claim checks.

## Data flow

```text
Authorized source ── HTTP GET or POST /events/batch ──> Validation
                                                         │
                                                Normalized events
                                                         │
                                                    PostgreSQL
                                                         │
                                            SQL metrics + evidence
                                               │             │
                                          Dashboard     Optional LLM
                                                             │
                                                    Validation + history
```

## Code layout

- `backend/src/connectors/`: transport, security, JSON schema and mapping.
- `backend/src/services/`: catalog, ingestion, metrics, anomalies and diagnosis.
- `backend/src/ai/`: prompt creation, providers and output validation.
- `backend/src/demo/`: synthetic scenarios, seed and evaluation.
- `frontend/src/pages/`: app screens and filters.
- `frontend/src/components/`: shared UI and evidence display.

## Existing database

No new table is required. The application uses `projects`, `services`, `diagnostic_events`, `ai_analyses`, `connectors` and `connector_sync_runs`. Time-oriented indexes support reporting, while `(service_id, event_uid)` enforces per-service idempotency.

## Trade-offs

Mappings are configured rather than hard-coded. Deterministic evidence is useful without an LLM and testable offline. An anomaly is not a verified root cause. GET requests still have resource costs and must target authorized endpoints. The current application is local-first, not a multi-tenant hosted platform.
