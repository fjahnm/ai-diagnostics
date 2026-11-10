# AI pipeline

## Model input

The backend sends **service type, analysis period, execution totals, success/failure counts, success rate, average duration, HTTP error distribution, time-window comparison and deterministic evidence**. It does not include original payloads, connector URLs, access tokens, or project/service/customer names. See `backend/src/ai/prompt.ts`.

## Stages

1. PostgreSQL computes all numerical observations.
2. `detectAnomalies` creates stable evidence IDs such as `EV-429`, `EV-5XX`, `EV-TIMEOUT`, `EV-LATENCY` and `EV-TREND`.
3. The configured model adapter requests structured JSON.
4. The backend validates JSON fields and checks that every cited evidence ID really exists.
5. Final severity is derived from deterministic failure/latency rules. The prose is explicitly hypothetical.
6. The result and metrics/evidence snapshots are saved in `ai_analyses`.

## Reliability boundaries

The prompt discourages invented measurements and unsupported causality. Output validation rejects nonexistent references and compares numbers in model prose to values in trusted metrics and deterministic evidence, including their units. One corrective request is permitted for an unsupported number; the output is rejected if it fails again. The check is literal and does not establish semantic correctness. **These safeguards do not guarantee that a hypothesis is semantically correct.** Confidence labels are qualitative, not calibrated probabilities.

## No model required

The **Observed evidence** section uses `GET /api/services/:id/evidences?days=14`. The dashboard and deterministic findings work even if no AI provider is configured.

## Data minimization

The model receives aggregates and internally produced evidence descriptions. This reduces exposure, but aggregate data is not necessarily anonymous in every context. Production telemetry requires an explicit privacy and authorization review.

## Groq structured responses and output limits

The Groq adapter requests `response_format: json_schema` with `strict: true`. GPT-OSS models use `reasoning_effort: low` and an initial token budget controlled by `GROQ_MAX_COMPLETION_TOKENS` (default: 4096). Only when the provider explicitly reports JSON truncation caused by the output-token limit does the application retry **once** with at most twice the budget (capped at 16384 tokens). Authentication errors, schema configuration errors, and unrelated HTTP 400 failures are not retried.

A higher limit cannot guarantee completion. Successful responses still undergo schema validation, evidence-ID verification, and supported numeric-claim checks. The retry can increase token usage, so monitor usage and limits.
