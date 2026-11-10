import { db } from '../config/db.js';
import { AppError } from '../core/errors.js';
import { createPrompt } from '../ai/prompt.js';
import { generateDiagnosis, getProviderInfo } from '../ai/provider.js';
import { generateValidatedDiagnosis } from '../ai/generate-validated.js';
import { detectAnomalies, getSeverity } from './anomalies.service.js';
import { numericSources } from '../ai/validate.js';
import { findService } from './catalog.service.js';
import { getServiceMetrics } from './metrics.service.js';

const running = new Set<number>();

export async function analyzeService(serviceId: number, days: number) {
  if (running.has(serviceId)) throw new AppError('ANALYSIS_RUNNING',409,'Já existe uma análise em andamento para este serviço.');
  running.add(serviceId);
  try {
    const service = await findService(serviceId);
    if (!service) throw new AppError('SERVICE_NOT_FOUND',404,'Serviço não encontrado.');
    const metrics = await getServiceMetrics(serviceId,days);
    if (!metrics.total) throw new AppError('NO_EVENTS',422,'Não há eventos no período selecionado.');
    const evidences = detectAnomalies(metrics);
    const info = getProviderInfo();
    const created = await db.query(`
      INSERT INTO ai_analyses (service_id,provider,model,status,period_days,metrics_snapshot,evidences_snapshot)
      VALUES ($1,$2,$3,'pending',$4,$5::jsonb,$6::jsonb) RETURNING id`,
      [serviceId,info.provider,info.model,days,JSON.stringify(metrics),JSON.stringify(evidences)]);
    const id = Number(created.rows[0].id);
    const started = Date.now();
    try {
      const prompt = createPrompt(service, metrics, evidences);
      const validated = await generateValidatedDiagnosis(
        prompt,
        evidences.map(item => item.id),
        numericSources(metrics, evidences),
        generateDiagnosis
      );
      const valid = {...validated,gravidade:getSeverity(metrics)};
      await db.query(`UPDATE ai_analyses SET status='completed',result=$2::jsonb,
        duration_ms=$3, finished_at=now() WHERE id=$1`,
        [id,JSON.stringify(valid),Date.now()-started]);
      return getAnalysisById(id);
    } catch (error) {
      const code = error instanceof AppError ? error.code : 'LLM_UNKNOWN_ERROR';
      await db.query(`UPDATE ai_analyses SET status='failed',error_code=$2,
        duration_ms=$3,finished_at=now() WHERE id=$1`, [id,code,Date.now()-started]);
      throw error;
    }
  } finally {
    running.delete(serviceId);
  }
}

export async function getAnalysisById(id: number) {
  const result = await db.query(`
    SELECT a.id,a.service_id,s.name AS service_name,p.name AS project_name,
      a.provider,a.model,a.status,a.period_days,a.metrics_snapshot,a.evidences_snapshot,
      a.result,a.error_code,a.duration_ms,a.created_at,a.finished_at
    FROM ai_analyses a JOIN services s ON s.id=a.service_id
    JOIN projects p ON p.id=s.project_id WHERE a.id=$1`,[id]);
  if (!result.rows[0]) throw new AppError('ANALYSIS_NOT_FOUND',404,'Diagnóstico não encontrado.');
  return result.rows[0];
}

export async function listAnalyses(serviceId?: number) {
  const result = await db.query(`
    SELECT a.id,a.service_id,s.name AS service_name,p.name AS project_name,
      a.provider,a.model,a.status,a.period_days,a.error_code,a.duration_ms,a.created_at
    FROM ai_analyses a JOIN services s ON s.id=a.service_id
    JOIN projects p ON p.id=s.project_id
    WHERE ($1::int IS NULL OR a.service_id=$1)
    ORDER BY a.created_at DESC LIMIT 100`,[serviceId ?? null]);
  return result.rows;
}
