import type { IngestBatch } from '../core/validation.js';

export const DEMO_PROJECT = {
  slug: 'ai-diagnostics-showcase',
  name: 'AI Diagnostics — Demonstração',
  description: 'Cenários inteiramente sintéticos e reproduzíveis; não contêm dados de clientes.'
} as const;

type DemoEvent = IngestBatch['events'][number];

export interface DemoScenario {
  code: string;
  name: string;
  type: 'REST_API' | 'BACKGROUND_JOB';
  events: DemoEvent[];
  expected: { total: number; failed: number; evidence: string[] };
}

function createEvent(
  serviceCode: string,
  window: 'previous' | 'recent',
  index: number,
  reference: Date,
  status: number | null,
  duration: number,
  errorCode: string | null = null
): DemoEvent {
  // As duas faixas permitem avaliar a evolução de falhas sem depender de dados reais.
  const hoursAgo = window === 'previous' ? 26 + index * 0.8 : 2 + index * 0.8;
  const observed = new Date(reference.getTime() - hoursAgo * 60 * 60 * 1000);
  const success = status === null ? errorCode === null : status < 400;
  return {
    event_uid: `demo-v1-${serviceCode}-${window}-${index}`,
    observed_at: observed.toISOString(),
    level: success ? 'INFO' : 'ERROR',
    success,
    http_status: status,
    duration_ms: duration,
    error_code: errorCode,
    message: null
  };
}

export function buildDemoScenarios(reference = new Date()): DemoScenario[] {
  const checkout: DemoEvent[] = [];
  for (let i = 0; i < 24; i++) {
    const status = i === 0 ? 429 : i === 1 ? 503 : 200;
    checkout.push(createEvent('checkout-api', 'previous', i, reference, status, status === 200 ? 180 + i * 7 : 750, status === 429 ? 'RATE_LIMIT' : status === 503 ? 'UPSTREAM_ERROR' : null));
  }
  for (let i = 0; i < 24; i++) {
    const status = i < 12 ? 429 : i < 18 ? 503 : 200;
    checkout.push(createEvent('checkout-api', 'recent', i, reference, status, status === 200 ? 260 + i * 7 : 1050, status === 429 ? 'RATE_LIMIT' : status === 503 ? 'UPSTREAM_ERROR' : null));
  }

  const catalog: DemoEvent[] = [];
  for (let i = 0; i < 20; i++) catalog.push(createEvent('catalog-api', 'previous', i, reference, 200, 100 + (i % 5) * 15));
  for (let i = 0; i < 20; i++) catalog.push(createEvent('catalog-api', 'recent', i, reference, 200, 110 + (i % 5) * 15));

  const search: DemoEvent[] = [];
  for (let i = 0; i < 16; i++) search.push(createEvent('search-api', 'previous', i, reference, 200, 1450 + (i % 6) * 95));
  for (let i = 0; i < 16; i++) search.push(createEvent('search-api', 'recent', i, reference, 200, 1650 + (i % 6) * 105));

  const jobs: DemoEvent[] = [];
  for (let i = 0; i < 15; i++) jobs.push(createEvent('worker-jobs', 'previous', i, reference, null, 160 + (i % 4) * 30));
  for (let i = 0; i < 15; i++) {
    const timedOut = i < 9;
    jobs.push(createEvent('worker-jobs', 'recent', i, reference, null, timedOut ? 4300 : 180 + (i % 4) * 30, timedOut ? 'TIMEOUT' : null));
  }

  return [
    { code: 'checkout-api', name: 'Checkout API', type: 'REST_API', events: checkout,
      expected: { total: 48, failed: 20, evidence: ['EV-BASE', 'EV-429', 'EV-5XX', 'EV-TREND'] } },
    { code: 'catalog-api', name: 'Catalog API', type: 'REST_API', events: catalog,
      expected: { total: 40, failed: 0, evidence: ['EV-BASE'] } },
    { code: 'search-api', name: 'Search API', type: 'REST_API', events: search,
      expected: { total: 32, failed: 0, evidence: ['EV-BASE', 'EV-LATENCY'] } },
    { code: 'worker-jobs', name: 'Background Jobs', type: 'BACKGROUND_JOB', events: jobs,
      expected: { total: 30, failed: 9, evidence: ['EV-BASE', 'EV-TIMEOUT', 'EV-LATENCY', 'EV-TREND'] } }
  ];
}
