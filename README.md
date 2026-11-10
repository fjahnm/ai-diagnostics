# AI Diagnostics

[Português](README.pt-BR.md) · **English**

**Evidence-based observability and incident investigation for APIs and background jobs.**

AI Diagnostics collects operational events, computes verifiable metrics and detects patterns with deterministic rules. An optional large language model turns those observations into **hypotheses**, recommendations and limitations. The LLM does not calculate the underlying metrics.

## What it demonstrates

- End-to-end product engineering with React, Node.js, TypeScript, Express, PostgreSQL and Docker.
- Configurable read-only HTTP connectors and JSON field mapping.
- Idempotent event ingestion and SQL-based observability metrics.
- Deterministic incident evidence available **without an AI API key**.
- Optional LLM diagnosis through Groq, Gemini or local Ollama, validated against evidence IDs.
- A repeatable test suite and four controlled incident scenarios.

## Demo in five minutes (after setup)

```bash
cd backend
npm run demo:seed
npm run demo:evaluate
```

Open `http://127.0.0.1:5173`, select **AI Diagnostics — Demonstração** and **Last 14 days**, then open the services. The evidence cards work without an LLM. If an AI provider is configured, click **Analisar com IA** in a service to generate a new diagnosis. This step uses a real model; no model output is pre-recorded or simulated.

| Service | Executions | Failures | Expected detection |
|---|---:|---:|---|
| Checkout API | 48 | 20 | Rate limiting, server errors, rising failure rate |
| Catalog API | 40 | 0 | Healthy baseline, no invented anomaly |
| Search API | 32 | 0 | High average latency |
| Background Jobs | 30 | 9 | Missing HTTP status, latency and trend |

The seed replaces **only** events and analyses in the reserved `ai-diagnostics-showcase` project. Running it again refreshes the timestamps. It does not reset the PostgreSQL volume, delete other projects, or modify existing connectors. The command refuses to run against non-local databases or `NODE_ENV=production`.

## Local setup

Requires Node.js 20+, npm, Docker Compose and PostgreSQL 16 (via Docker). A Groq/Gemini key or Ollama is **optional** for the deterministic demo.

```bash
# Terminal 1 — project root
# Never run docker compose down -v on an existing installation.
docker compose up -d

# Terminal 2
cd backend
cp .env.example .env    # On PowerShell: Copy-Item .env.example .env
# Adjust DATABASE_URL, INGEST_API_KEY and optional AI/connector settings.
npm install
npm run db:setup         # Safe CREATE TABLE IF NOT EXISTS on the local database
npm run demo:seed
npm run demo:evaluate
npm run dev

# Terminal 3
cd frontend
npm install
npm run dev
```

On an existing installation, **keep your current `backend/.env` and database volume**. Use the included SQL definition only to initialize a fresh local database. No new schema migration is required for this release.

Run tests: `cd backend && npm test && npm run test:integration && npm run build`; run `cd frontend && npm run build`. Integration tests require a running local PostgreSQL instance.

### Optional LLM evaluation

```bash
cd backend
npm run demo:evaluate -- --llm
```

The `--llm` option requests real model analyses and validates their schema and evidence references. Results may vary between calls. It is **not** a benchmark of model accuracy or a guarantee of root cause identification. Be mindful of provider limits and costs.

## How it works

```text
HTTP GET connectors / manual event ingestion
                 |
     Schema validation and normalization
                 |
          PostgreSQL events
                 |
      Metrics and deterministic evidence
                 |
      Dashboard (no model required)
                 |
    Optional LLM diagnosis and validation
                 |
       Analysis history with snapshots
```

## Engineering decisions and limitations

A connector can read arbitrary JSON arrays using configured field paths; it does not execute remote commands. Requests are bounded by time, page count and response size. Connector credentials are encrypted at rest. The AI prompt contains only aggregate technical metrics, service type, and backend-generated evidence—not raw event payloads or service/project names.

This project is **not a production-ready multi-user observability SaaS**: it has no per-user RBAC, distributed scheduling, persistent analysis queue, guaranteed PII de-identification, or complete DNS-rebinding-resistant network isolation. Keep it on loopback for local demonstrations. Production data must not be connected without authorization, egress restrictions, appropriate data minimization and a security review. A simple health check proves availability only, not incident root cause.

## Documentation

| Topic | English | Português |
|---|---|---|
| Reproducible demo | [Demo](docs/DEMO.en.md) | [Demonstração](docs/DEMO.pt-BR.md) |
| Architecture | [Architecture](docs/ARCHITECTURE.en.md) | [Arquitetura](docs/ARCHITECTURE.pt-BR.md) |
| AI pipeline | [AI pipeline](docs/AI_PIPELINE.en.md) | [Pipeline de IA](docs/AI_PIPELINE.pt-BR.md) |
| Connectors | [Connectors](docs/CONNECTORS.en.md) | [Conexões](docs/CONNECTORS.pt-BR.md) |
| Security | [Security](docs/SECURITY.en.md) | [Segurança](docs/SECURITY.pt-BR.md) |
| Evaluation | [Evaluation](docs/EVALUATION.en.md) | [Avaliação](docs/EVALUATION.pt-BR.md) |

Additional implementation reference: [Detailed technical guide (Portuguese)](docs/TECHNICAL_GUIDE.pt-BR.md).

## Authorship

Developed as a software engineering and applied AI portfolio project. **Author: Felipe Jahn Macedo** · [GitHub](https://github.com/fjahnm).

## Technical Article

- [Evidence-Based AI Diagnostics: Architecture, Validation and Reproducible Evaluation](docs/articles/evidence-based-ai-diagnostics.en.md)
- [Portuguese version](docs/articles/diagnosticos-ia-evidencias.pt-BR.md)
