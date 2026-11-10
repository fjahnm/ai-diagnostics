# AI Diagnostics: Engineering Evidence-Based API Incident Analysis with LLMs

**Author:** Felipe Jahn Macedo  
**Project:** [AI Diagnostics — GitHub](https://github.com/fjahnm/ai-diagnostics)  
**Field:** AI Software Engineering · Observability · Reliability Engineering  
**Technology:** TypeScript, Node.js, Express, React, PostgreSQL, Docker, Vitest, Groq  
**Case-study scope:** Version 1.1.x implementation, reviewed November 2026

## Abstract

API incidents and background-job failures produce observable signals such as HTTP error codes, increased latency, and missing responses. A large language model (LLM) can help explain these signals, but it should not be responsible for inventing or calculating the underlying facts. This article presents **AI Diagnostics**, a system that explicitly separates event ingestion, SQL-derived metrics, deterministic evidence detection, and LLM-assisted interpretation. Normalized events are persisted in PostgreSQL, deterministic rules emit traceable evidence identifiers, and an optional LLM generates structured hypotheses and recommendations. The backend then validates the output schema, references to existing evidence, and numerical statements against trusted observations. A controlled demonstration consists of **150 entirely synthetic events across four services**. During local verification, **31 unit tests, four PostgreSQL integration tests, and four deterministic evaluation scenarios passed**; an earlier optional run also produced four schema-validated Groq analyses. These results demonstrate implementation correctness within the test scope and repeatability of controlled scenarios, **not statistically established root-cause accuracy**. The case study emphasizes that observability measurements and causal interpretations are different kinds of claims and must be treated differently.

**Keywords:** AI engineering; observability; LLM; evidence grounding; API diagnostics; software reliability; structured output; PostgreSQL.

## 1. Motivation and problem definition

Operational logs record symptoms, but symptoms alone do not explain incidents. Consider a checkout API returning both **HTTP 429** and **HTTP 503** during a period of increasing failures. These observations support statements about rate limiting and server errors, but they do not conclusively identify an upstream provider, infrastructure change, or database operation as the cause.

An unconstrained LLM can produce persuasive yet unsupported narratives: extrapolating percentages, inventing timings, or presenting a plausible correlation as a confirmed causal mechanism. AI Diagnostics addresses a narrower engineering question:

**How can a language model assist operational investigations without becoming the source of truth for measured system behavior?**

The solution is to reserve quantitative measurement for deterministic services and treat generated narratives as hypotheses that must reference verifiable evidence.

## 2. Engineering goals

The application was designed around five concrete goals:

1. **Controlled and idempotent ingestion:** accept normalized events, reject invalid input, and avoid repeated insertion of the same service event.
2. **Backend-owned measurements:** calculate operational indicators in PostgreSQL rather than through language-model reasoning.
3. **Traceable evidence:** represent observations with stable identifiers and make them available independently of any model provider.
4. **Constrained AI interpretation:** require structured hypotheses, verify evidence references, and record explicit failures for invalid or unavailable responses.
5. **Reproducibility:** evaluate scenarios without enterprise telemetry, a production connection, or prerecorded model answers.

A deliberate product decision is that **the evidence dashboard works without an LLM API key**. Generative analysis is an optional interpretation layer, not a prerequisite for basic observability.

## 3. System architecture

```text
Authorized telemetry sources / event ingestion API
                         |
                Input validation
                         |
               PostgreSQL events
                         |
              SQL-derived metrics
                         |
           Deterministic evidence IDs
                 /                 \
      Evidence dashboard       Aggregated context
                                     |
                              Optional LLM provider
                                     |
                            Response validation
                                     |
                          History and snapshots
```

| Component | Responsibility | Implementation |
|---|---|---|
| Web interface | Display projects, services, metrics, evidence, and history | React and TypeScript |
| REST API | Enforce contracts, expose endpoints, normalize errors | Express, Helmet, Zod |
| Ingestion/connectors | Accept event batches or read authorized HTTP data sources | Ingestion service and GET connectors |
| Persistence | Store projects, services, events, model analyses, connector configurations and sync history | PostgreSQL |
| Deterministic engine | Derive metrics, assign evidence IDs and severity | SQL and TypeScript rules |
| AI adapter | Prepare context, invoke provider, validate responses | Groq, Gemini or Ollama |

The database contains six primary tables: `projects`, `services`, `diagnostic_events`, `ai_analyses`, `connectors`, and `connector_sync_runs`. A uniqueness constraint on `(service_id, event_uid)` supports service-scoped idempotency. Each model analysis records its status, model/provider metadata, result or error, and snapshots of the evidence and metrics used when it ran.

**Implementation references:** [architecture](../ARCHITECTURE.en.md), [ingestion](../../backend/src/services/ingest.service.ts), and [diagnostic service](../../backend/src/services/diagnostics.service.ts).

## 4. Event ingestion and deterministic measurements

The event schema contains a unique event ID, timezone-aware observation timestamp, log level, success flag, optional HTTP status, duration, and optional error code/message. Zod validation enforces data bounds and consistency between `success` and `http_status`. Ingestion runs inside a transaction and uses `ON CONFLICT (service_id, event_uid) DO NOTHING`; the response separates received, inserted and duplicate events.

Metrics are queried using service/project filters and a selected time window. The backend derives:

- Execution, success, and failure counts;
- Success rate and mean duration, where observations exist;
- Failure distribution by HTTP status;
- Daily activity for visualization;
- Recent 24-hour versus previous 24-hour failure counts.

A derived failure rate can be expressed as `failed / total × 100` when `total > 0`. No observed rate should be asserted for an empty sample. For grouping purposes, missing HTTP status is represented with `0` inside the error distribution; **zero is not an actual HTTP status**, and an absent status is not definitive proof of a timeout.

This design deliberately makes the quantitative layer testable without probabilistic output. The model receives aggregated values and backend-generated evidence; it does not calculate the monitoring dashboard's measurements.

**Implementation references:** [validation contracts](../../backend/src/core/validation.ts) and [SQL metrics](../../backend/src/services/metrics.service.ts).

## 5. Deterministic evidence and severity

Evidence objects contain an ID, type, human-readable description, and numeric values. IDs are the bridge between quantitative observations and generated hypotheses.

| Evidence ID | Implementation trigger | Supported interpretation |
|---|---|---|
| `EV-BASE` | At least one observed event | Execution/failure baseline |
| `EV-429` | An observed HTTP 429 failure | Rate-limited responses occurred |
| `EV-5XX` | Observed failed requests with 500–599 status | Server-side error responses occurred |
| `EV-TIMEOUT` | Failures without a recorded HTTP status | Missing-status failures requiring investigation |
| `EV-LATENCY` | Mean duration at least 1,200 ms | Mean latency exceeds a **demonstration threshold** |
| `EV-TREND` | At least five observations in each 24-hour interval and a failure-rate increase of at least 15 percentage points | Measured deterioration between the intervals |

The **1,200 ms** latency threshold is illustrative; it is not presented as a universal service-level objective. Likewise, two adjacent windows provide a trend indicator, not a causal explanation.

Final severity is assigned by deterministic backend rules: failure rate at least 25% gives `alta` (high); at least 10% gives `media` (medium); otherwise, mean duration at least 1,200 ms can also yield `media`; in other cases severity is `baixa` (low). These are explicit demonstration policy rules, **not calibrated business-impact scores**. The backend overwrites the severity field suggested by the model.

**Implementation reference:** [anomaly detection](../../backend/src/services/anomalies.service.ts).

## 6. LLM integration and trust boundaries

The adapter supports **Groq, Gemini and Ollama** through a common diagnostic contract. The documented live-model evaluation used Groq with `openai/gpt-oss-20b`; support for other providers should not be mistaken for an identical empirical evaluation of all of them.

The LLM receives a structured context containing service **type**, analysis period, aggregate metrics, recent time-window counts, and evidence objects. It does **not** receive raw event payloads, original messages, service/project/client names, connector URLs, or tokens. This minimizes data disclosure, but aggregates alone do not guarantee anonymity in every context.

A simplified example of the output contract is:

```json
{
  "resumo": "Summary based on available observations.",
  "gravidade": "media",
  "hipoteses": [
    {
      "descricao": "A possible explanation that requires investigation.",
      "confianca": "baixa",
      "evidencias": ["EV-429"],
      "recomendacao": "Review request volume and rate limits."
    }
  ],
  "limitacoes": ["The evidence does not establish root cause."]
}
```

*This example illustrates the structure; it is not a quoted experimental model response. The field names and enumerations are intentionally kept in the application's Portuguese JSON contract.*

Validation is layered:

1. **Schema validation:** Zod checks required properties, types, allowed values and size constraints. Groq requests strict JSON-schema output (`json_schema`, `strict: true`).
2. **Evidence validation:** every hypothesis must cite one or more evidence identifiers actually generated for the analyzed service.
3. **Numeric claim validation:** numbers extracted from free-text narratives are compared with trusted metric/evidence tokens, including units. A raw count cannot authorize the same value formatted as a percentage.
4. **Bounded correction:** unsupported numeric claims may trigger one reformulation request; malformed structures or invalid evidence references are not simply accepted.
5. **Backend-defined severity:** a validated model result is stored with the severity computed by deterministic rules.
6. **Fail-closed behavior:** an unavailable, misconfigured, or invalid model response is recorded as a failed analysis rather than replaced by a fabricated diagnosis.

In the Groq adapter, a specifically identified JSON truncation error can prompt **one additional completion attempt** with a larger bounded token budget. This addresses one recoverable transport/output condition, not the truthfulness of the model's reasoning.

These controls address specific classes of unsupported output. They **do not prove semantic or causal correctness**: a plausible hypothesis may cite real evidence and still be wrong. The `confianca` field is a qualitative label, not a calibrated statistical probability.

**Implementation references:** [prompt](../../backend/src/ai/prompt.ts), [JSON contract](../../backend/src/ai/schema.ts), [validation](../../backend/src/ai/validate.ts), [bounded correction](../../backend/src/ai/generate-validated.ts), and [provider adapter](../../backend/src/ai/provider.ts).

## 7. Reproducible evaluation methodology

A controlled dataset was created to test the end-to-end behavior without relying on real customer information. A deterministic scenario builder generates **150 entirely synthetic events** with timestamps relative to the run. The data are scoped to the reserved `ai-diagnostics-showcase` project.

The seeding procedure checks for unexpected services and linked connectors before replacing only the demonstration project's planned events and analyses. It refuses production mode and non-local PostgreSQL hosts. These safeguards reduce accidental damage in local evaluations; they are not a general backup or disaster-recovery strategy.

| Scenario | Events | Failures | Expected evidence IDs |
|---|---:|---:|---|
| Checkout API | 48 | 20 | `EV-BASE`, `EV-429`, `EV-5XX`, `EV-TREND` |
| Catalog API | 40 | 0 | `EV-BASE` |
| Search API | 32 | 0 | `EV-BASE`, `EV-LATENCY` |
| Background Jobs | 30 | 9 | `EV-BASE`, `EV-TIMEOUT`, `EV-LATENCY`, `EV-TREND` |
| **Total** | **150** | **29** | Four distinct cases |

The healthy **Catalog API** scenario is important: a system must not invent incidents simply because an AI analysis feature exists. The Search API scenario distinguishes latency from request failure. Background Jobs demonstrates why missing HTTP status must not be mistaken for a proven timeout cause.

`npm run demo:evaluate` reads persisted data, recomputes the metrics/evidence, and compares the event counts, failure counts, and exact expected evidence-ID sequence. Any mismatch causes the command to fail. This default evaluation **makes no external LLM request**.

The optional `npm run demo:evaluate -- --llm` invokes a real model and validates the structured result. Because its narrative may vary, it does not compare prose with a fixed answer and **does not establish diagnostic accuracy** against expert-confirmed incident causes.

**Implementation references:** [scenario generator](../../backend/src/demo/scenarios.ts), [seeding](../../backend/src/demo/seed.ts), [evaluation runner](../../backend/src/demo/evaluate.ts), and [evaluation design](../EVALUATION.en.md).

## 8. Observed results and evidence strength

The recorded local verification produced the following outcomes:

| Check | Observed result | What it supports |
|---|---|---|
| Unit suite | **31/31 tests passed** | Tested logic and data contracts behaved as expected |
| PostgreSQL/API integration suite | **4/4 tests passed** | The covered HTTP, authentication-key, idempotency, evidence and failure-recording paths worked with the local database |
| Backend TypeScript build | **Passed** | The backend compiled in the tested environment |
| Deterministic demonstration | **4/4 scenarios passed** | Synthetic counts and evidence IDs matched the configured expectations |
| Optional Groq run | **Four real analyses validated in an earlier local evaluation** | One run satisfied the schema and evidence contract; not a statistical accuracy study |
| Local `npm audit` checks | **0 reported vulnerabilities in backend and frontend checks** | A time-specific dependency-audit result, not proof of comprehensive security |

Integration tests specifically cover database health, protected administrative writes, idempotent ingestion with metrics/evidence, and explicit failure recording when an LLM is not configured. The repository also defines GitHub Actions jobs; the latest CI status must be read from the actual workflow run rather than inferred from local tests.

These results establish **controlled reproducibility and tested contracts**. They do not justify claims of reduced incident response time, superior accuracy to human engineers, or a known percentage of correctly identified root causes.

## 9. Security, privacy, and operational constraints

Implemented protections include structured validation, parameterized SQL, bounded request payloads, constrained GET connectors, local concurrency controls, encrypted connector secrets at rest, and data minimization before LLM calls. Nevertheless, the current implementation **is not an enterprise-ready, publicly exposed multi-tenant observability platform**.

Known limitations include:

- **Identity and authorization:** a shared ingestion key is not a replacement for individual authentication, RBAC, or organization-level isolation; read/analysis permissions also require review.
- **SSRF and DNS rebinding:** preliminary IP/URL validation is insufficient for comprehensive network isolation; production requires enforced egress controls and allowlists.
- **Privacy:** limited message redaction is not complete anonymization; real telemetry requires data minimization, defined retention and appropriate authorization.
- **Jobs and concurrency:** in-process analysis locks do not implement durable distributed job scheduling.
- **Interpretability:** deterministic evidence is not a causal proof, and technical severity does not necessarily equal business impact.
- **Model evaluation:** expert-labeled reference incidents, systematic adversarial tests, per-model quality and token-cost measurements are future work.

Reproducing the synthetic demonstration does not require production credentials or enterprise data.

**Additional reference:** [security and threat documentation](../SECURITY.en.md).

## 10. How to reproduce

**Requirements:** compatible Node.js, npm, Docker Compose, and local PostgreSQL. From the repository root:

```bash
# Start the isolated local database. Do not run 'docker compose down -v'
# against a database whose contents must be preserved.
docker compose up -d

cd backend
# For a fresh installation only, create backend/.env from .env.example
# and configure DATABASE_URL and INGEST_API_KEY for local development.
npm ci
npm run db:setup
npm run demo:seed
npm run demo:evaluate
npm test
npm run test:integration
npm run build

# Optional: uses an actual provider, may incur costs, and requires credentials.
npm run demo:evaluate -- --llm
```

To view the interface, run `npm ci` and `npm run dev` in `frontend` from a separate terminal. The [demonstration guide](../DEMO.en.md) provides the full walkthrough. Never overwrite an existing configured `.env` with the template.

## 11. Future research and engineering work

Meaningful next experiments include: (1) expert annotation of a reference incident set; (2) systematic evaluation of correct evidence attribution, unsupported claims and plausible-but-wrong causal inferences; (3) cost/latency/rejection-rate tracking by provider and model version; (4) prompt-injection and contradictory-evidence stress tests; (5) SLO-driven alert thresholds; and (6) a separate classical ML anomaly-detection experiment with explicit training, validation and model publication.

The last item is a **proposed extension**, not part of the current evaluation. AI Diagnostics consumes language models through a provider interface; it does not train its own anomaly-detection model in the version described here.

## 12. Conclusion

The central engineering result is a clear allocation of responsibilities: **PostgreSQL measures, deterministic rules produce evidence, the LLM interprets, and the backend validates**. This architecture gives a generative model a useful role without giving it authority over raw measurements. Traceable IDs, structured contracts, numeric checks, history snapshots, and synthetic evaluations make the behavior more reviewable and reproducible than an unconstrained chatbot integration.

The implementation does not eliminate hallucinations or independently prove root causes. Its practical value lies in making the boundaries of evidence, inference, and uncertainty explicit—an essential principle of reliable AI software engineering.

---

## References and reproducibility materials

1. **Source code and README:** [AI Diagnostics](https://github.com/fjahnm/ai-diagnostics).
2. **System architecture:** [ARCHITECTURE.en.md](../ARCHITECTURE.en.md).
3. **Model pipeline and safeguards:** [AI_PIPELINE.en.md](../AI_PIPELINE.en.md).
4. **Evaluation specification:** [EVALUATION.en.md](../EVALUATION.en.md).
5. **Security limitations:** [SECURITY.en.md](../SECURITY.en.md).
6. **Evidence implementation:** [anomalies.service.ts](../../backend/src/services/anomalies.service.ts).
7. **LLM validation implementation:** [validate.ts](../../backend/src/ai/validate.ts).
8. **Synthetic fixtures:** [scenarios.ts](../../backend/src/demo/scenarios.ts).

*Technical engineering case study. Reported results apply to the implementation and runs described; they are not a formal empirical claim of diagnostic effectiveness in live production environments.*
