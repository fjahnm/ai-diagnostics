# Security and privacy

## Purpose

Keep an observability showcase from exposing secrets, personal information or employer infrastructure. This is a **local-first application**, not a public multi-user service.

## Publication checklist

- Never commit `backend/.env`, passwords, JWTs, PostgreSQL dumps, corporate logs, or screenshots with customer information.
- Use `backend/.env.example` and generate new local keys.
- Bind the backend to loopback during demonstrations.
- Do not use production admin credentials in a public video or repository.
- Use `npm run demo:seed` rather than corporate endpoints for the portfolio demo.
- Review `git status`, `git diff --cached`, and commit history. `.gitignore` does not remove secrets that were committed previously.
- Rotate exposed credentials and revoke sessions when appropriate.

## Implemented safeguards

Zod schema validation, parameterized SQL, bounded HTTP requests, URL scheme checks, basic concurrency controls, AES-GCM credential encryption and validation of LLM output. The demo seed only targets a local PostgreSQL instance and rejects `NODE_ENV=production`. AI prompts contain aggregates and backend-created evidence, not raw messages or project/service names.

## Known limitations and next steps

1. **Authorization:** a single management key is not a substitute for user sessions, RBAC or tenant isolation; public read/analysis endpoints require an explicit policy.
2. **SSRF/DNS rebinding:** DNS checks before `fetch` do not pin the actual destination IP. Production needs egress-level allowlists and IPv4/IPv6 protections.
3. **Personal data:** text pattern redaction is not guaranteed anonymization. Minimize data at the source and define retention/privacy reviews.
4. **Monitor observability:** structured audit logs and health/alert monitoring are still needed.
5. **Durable jobs:** use queues, scheduling, retries and distributed coordination at scale.
6. **Secrets:** use a managed secrets vault and credential rotation in business environments.

These are documented risks, **not implemented capabilities**.
