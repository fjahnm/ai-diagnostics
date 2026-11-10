# Evaluation plan

## What is measured today

`npm run demo:evaluate` reads PostgreSQL metrics and verifies **event totals, failure totals and deterministic evidence IDs** for each synthetic scenario. Any mismatch fails the command. Unit tests verify schema conformity, bounded timestamps, deterministic generation and expected anomaly patterns. Existing integration tests cover the API and actual PostgreSQL persistence.

| Scenario | Expected failures | Core assertions |
|---|---:|---|
| Checkout API | 20/48 | `EV-429`, `EV-5XX`, `EV-TREND` |
| Catalog API | 0/40 | Baseline only; no invented incident |
| Search API | 0/32 | `EV-LATENCY` |
| Background Jobs | 9/30 | `EV-TIMEOUT`, `EV-LATENCY`, `EV-TREND` |

## Optional model calls

`npm run demo:evaluate -- --llm` requests a real diagnosis and checks JSON format and evidence references. It does **not** establish semantic or causal accuracy. Because model responses can vary, deterministic CI checks never depend on an external provider. We make no unmeasured percentage accuracy claims.

## Future evaluation work

1. Prepare independently reviewed reference incidents.
2. Grade supported observations, plausible hypotheses and unsupported causal statements separately.
3. Record model/version, parameters, dataset, response latency, cost and provider failure rates.
4. Compare providers with identical inputs and validators.
5. Test adversarial inputs, sparse data, conflicting metrics and prompt injection attempts.

**Important:** valid output and valid evidence references do not prove a correct root cause diagnosis.
