import { db } from '../config/db.js';
import { AppError } from '../core/errors.js';

interface Filters { days: number; serviceId?: number; projectId?: number }

export async function getMetrics({ days, serviceId, projectId }: Filters) {
  const params = [days, serviceId ?? null, projectId ?? null];
  const where = `e.observed_at >= now() - $1::int * interval '1 day'
    AND ($2::int IS NULL OR e.service_id = $2)
    AND ($3::int IS NULL OR s.project_id = $3)`;

  const [summaryResult, codesResult, dailyResult, windowsResult] = await Promise.all([
    db.query(`SELECT COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE e.success)::int AS succeeded,
      COUNT(*) FILTER (WHERE NOT e.success)::int AS failed,
      ROUND(AVG(e.duration_ms))::int AS avg_duration_ms,
      ROUND(100.0 * COUNT(*) FILTER (WHERE e.success) / NULLIF(COUNT(*),0),2)::float AS success_rate
      FROM diagnostic_events e JOIN services s ON s.id=e.service_id WHERE ${where}`, params),
    db.query(`SELECT COALESCE(e.http_status,0)::int AS code, COUNT(*)::int AS count
      FROM diagnostic_events e JOIN services s ON s.id=e.service_id
      WHERE ${where} AND (NOT e.success)
      GROUP BY COALESCE(e.http_status, 0)::int ORDER BY count DESC, code`, params),
    db.query(`SELECT to_char(date_trunc('day',e.observed_at AT TIME ZONE 'UTC'),'YYYY-MM-DD') AS day,
      COUNT(*) FILTER (WHERE e.success)::int AS succeeded,
      COUNT(*) FILTER (WHERE NOT e.success)::int AS failed
      FROM diagnostic_events e JOIN services s ON s.id=e.service_id
      WHERE ${where} GROUP BY day ORDER BY day`, params),
    db.query(`SELECT
      COUNT(*) FILTER (WHERE e.observed_at >= now() - interval '24 hours')::int AS recent_total,
      COUNT(*) FILTER (WHERE e.observed_at >= now() - interval '24 hours' AND NOT e.success)::int AS recent_failed,
      COUNT(*) FILTER (WHERE e.observed_at >= now() - interval '48 hours'
        AND e.observed_at < now() - interval '24 hours')::int AS previous_total,
      COUNT(*) FILTER (WHERE e.observed_at >= now() - interval '48 hours'
        AND e.observed_at < now() - interval '24 hours' AND NOT e.success)::int AS previous_failed
      FROM diagnostic_events e JOIN services s ON s.id=e.service_id WHERE ${where}`, params)
  ]);

  const summary = summaryResult.rows[0];
  return {
    days,
    total: summary.total as number,
    succeeded: summary.succeeded as number,
    failed: summary.failed as number,
    success_rate: summary.success_rate == null ? null : Number(summary.success_rate),
    avg_duration_ms: summary.avg_duration_ms as number | null,
    error_distribution: codesResult.rows as Array<{code:number; count:number}>,
    timeline: dailyResult.rows as Array<{day:string;succeeded:number;failed:number}>,
    windows: windowsResult.rows[0] as {
      recent_total:number;recent_failed:number;previous_total:number;previous_failed:number
    }
  };
}

export async function getServiceMetrics(serviceId: number, days: number) {
  const found = await db.query('SELECT 1 FROM services WHERE id=$1', [serviceId]);
  if (!found.rowCount) throw new AppError('SERVICE_NOT_FOUND',404,'Serviço não encontrado.');
  return getMetrics({ days, serviceId });
}

export async function listEvents(serviceId: number, page: number) {
  const limit = 30;
  const result = await db.query(`
    SELECT id,event_uid,observed_at,level,success,http_status,duration_ms,error_code,message
    FROM diagnostic_events WHERE service_id=$1 ORDER BY observed_at DESC, id DESC
    LIMIT $2 OFFSET $3`, [serviceId, limit, (page-1)*limit]);
  return { items: result.rows, page, page_size: limit };
}
