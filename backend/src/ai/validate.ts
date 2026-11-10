import { AppError } from '../core/errors.js';
import { diagnosticSchema } from '../core/validation.js';
import type { Evidence } from '../services/anomalies.service.js';
import type { getMetrics } from '../services/metrics.service.js';

type Metrics = Awaited<ReturnType<typeof getMetrics>>;

// O texto do modelo só pode repetir valores presentes nas métricas ou evidências.
// A unidade faz parte da comparação: "13" não valida uma afirmação de "13%".
const numberPattern = /(?<![\p{L}\p{N}])(\d+(?:[.,]\d+)?)(?:\s*(%|ms|xx|h))?(?![\p{L}\p{N}])/giu;

function numericTokens(text: string): string[] {
  return Array.from(text.matchAll(numberPattern), match => {
    const number = Number(match[1]!.replace(',', '.'));
    const unit = (match[2] ?? '').toLowerCase();
    return `${number}${unit}`;
  });
}

export function numericSources(metrics: Metrics, evidences: Evidence[]): string[] {
  const sources = [
    `${metrics.days} dias`,
    `${metrics.total} execuções`,
    `${metrics.succeeded} sucessos`,
    `${metrics.failed} falhas`,
    ...metrics.error_distribution.map(item => `HTTP ${item.code}: ${item.count} ocorrências`),
    ...evidences.map(item => item.description)
  ];

  if (metrics.success_rate !== null) sources.push(`${metrics.success_rate}% de sucesso`);
  if (metrics.avg_duration_ms !== null) sources.push(`${metrics.avg_duration_ms} ms de duração média`);
  return sources;
}

export function validateDiagnosis(value: unknown, evidenceIds: string[], trustedSources: string[] = []) {
  const parsed = diagnosticSchema.safeParse(value);
  if (!parsed.success) throw new AppError('LLM_OUTPUT_INVALID', 502, 'Modelo retornou dados fora do contrato.');

  const validIds = new Set(evidenceIds);
  for (const hypothesis of parsed.data.hipoteses) {
    if (!hypothesis.evidencias.length || hypothesis.evidencias.some(id => !validIds.has(id))) {
      throw new AppError('LLM_EVIDENCE_INVALID', 502, 'O diagnóstico citou evidências inexistentes.');
    }
  }

  const permitted = new Set(trustedSources.flatMap(numericTokens));
  const narratives = [
    parsed.data.resumo,
    ...parsed.data.limitacoes,
    ...parsed.data.hipoteses.flatMap(item => [item.descricao, item.recomendacao])
  ];

  if (narratives.some(text => numericTokens(text).some(token => !permitted.has(token)))) {
    throw new AppError('LLM_NUMERIC_CLAIM', 502,
      'O diagnóstico contém números não encontrados nas métricas ou evidências.');
  }

  return parsed.data;
}
