import { getServiceMetrics } from '../services/metrics.service.js';
import { detectAnomalies, getSeverity } from '../services/anomalies.service.js';

export async function getEvidenceReport(serviceId: number, days: number) {
  const metrics = await getServiceMetrics(serviceId, days);
  return {
    service_id: serviceId,
    period_days: days,
    severity: getSeverity(metrics),
    evidences: detectAnomalies(metrics),
    note: 'Evidências calculadas por regras determinísticas; não são diagnóstico de causa raiz.'
  };
}
