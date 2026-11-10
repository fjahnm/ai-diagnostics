import type { getMetrics } from './metrics.service.js';

type Metrics = Awaited<ReturnType<typeof getMetrics>>;
export interface Evidence {
  id: string;
  type: string;
  description: string;
  values: Record<string, number | null>;
}

function percent(n: number, total: number): number {
  return total ? Math.round(n * 10000 / total) / 100 : 0;
}

export function detectAnomalies(metrics: Metrics): Evidence[] {
  if (metrics.total === 0) return [];
  const evidences: Evidence[] = [];
  evidences.push({
    id: 'EV-BASE', type: 'RESUMO',
    description: `Foram registradas ${metrics.total} execuções, sendo ${metrics.failed} falhas no período.`,
    values: { total: metrics.total, failed: metrics.failed, success_rate: metrics.success_rate }
  });

  const rate429 = metrics.error_distribution.find(x => x.code === 429)?.count ?? 0;
  if (rate429 > 0) evidences.push({
    id: 'EV-429', type: 'RATE_LIMIT',
    description: `${rate429} execuções retornaram HTTP 429.`,
    values: { count: rate429, percent_of_all: percent(rate429,metrics.total) }
  });

  const serverErrors = metrics.error_distribution
    .filter(x => x.code >= 500 && x.code <= 599)
    .reduce((acc,x) => acc + x.count,0);
  if (serverErrors > 0) evidences.push({
    id: 'EV-5XX', type: 'SERVER_ERRORS',
    description: `${serverErrors} execuções retornaram códigos HTTP da família 5xx.`,
    values: { count: serverErrors, percent_of_all: percent(serverErrors,metrics.total) }
  });

  const noStatus = metrics.error_distribution.find(x => x.code === 0)?.count ?? 0;
  if (noStatus > 0) evidences.push({
    id: 'EV-TIMEOUT', type: 'NO_HTTP_STATUS',
    description: `${noStatus} falhas ocorreram sem código HTTP registrado; é necessária investigação da causa.`,
    values: { count: noStatus }
  });

  if (metrics.avg_duration_ms !== null && metrics.avg_duration_ms >= 1200) evidences.push({
    id: 'EV-LATENCY', type: 'HIGH_AVG_LATENCY',
    description: `Tempo médio observado de ${metrics.avg_duration_ms} ms, acima do limiar ilustrativo de 1200 ms.`,
    values: { avg_duration_ms: metrics.avg_duration_ms, illustrative_threshold_ms: 1200 }
  });

  const { recent_total, recent_failed, previous_total, previous_failed } = metrics.windows;
  const recentRate = percent(recent_failed,recent_total);
  const previousRate = percent(previous_failed,previous_total);
  if (recent_total >= 5 && previous_total >= 5 && recentRate >= previousRate + 15) evidences.push({
    id: 'EV-TREND', type: 'FAILURE_RATE_INCREASE',
    description: `Taxa de falhas nas últimas 24h: ${recentRate}%; nas 24h anteriores: ${previousRate}%.`,
    values: { recent_rate: recentRate, previous_rate: previousRate }
  });
  return evidences;
}

export function getSeverity(metrics: Metrics): 'baixa'|'media'|'alta' {
  if (!metrics.total) return 'baixa';
  const rate = metrics.failed / metrics.total;
  if (rate >= 0.25) return 'alta';
  if (rate >= 0.1) return 'media';
  if (metrics.avg_duration_ms !== null && metrics.avg_duration_ms >= 1200) return 'media';
  return 'baixa';
}
