# External connectors

AI Diagnostics queries existing HTTP APIs without a custom adapter for each provider. You configure the URL, authentication, JSON record path, field mapping and pagination.

## Modes

| Mode | Request | Output |
|---|---|---|
| `HTTP_CHECK` | One GET | Observed status, duration and availability |
| `JSON_LOGS` | GET returning JSON | Normalized, deduplicated events |

For `{ "items": [...] }`, the record array path is `items`. Nested field paths use dots (for example `meta.status`). Configurable fields are `event_uid`, `observed_at`, `success`, `http_status`, `duration_ms`, `error_code` and `message`; optional paths may be blank. A valid event requires a timestamp, duration and an identifiable success/failure outcome.

## Current safeguards

- GET only, no automatic redirects, bounded request timeouts.
- Response-size and page-count limits.
- At-rest AES-256-GCM encryption for credentials.
- URL validation and private-address blocking when `CONNECTOR_ALLOW_PRIVATE_HOSTS=false`.
- Idempotency using `(service_id, event_uid)`.
- Synchronization history does not store raw external payloads.

## Security limitations

Current hostname/address checks are **not complete SSRF or DNS-rebinding protection**. Do not expose connector management publicly without strong authentication, authorization, network egress policies and security testing. A JSON endpoint can return confidential fields even when its mapper ignores them: those fields still reach the process memory. For business use, fetch from a dedicated endpoint that removes sensitive fields **at the source**.

The reproducible showcase does not need any corporate API access.
