import { db } from '../config/db.js';
import { AppError } from '../core/errors.js';
import type { IngestBatch } from '../core/validation.js';

function redact(input: string | null | undefined): string | null {
  if (!input) return null;
  return input
    .replace(/\b(bearer|token|password|secret|api[_-]?key)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]')
    .replace(/sk-[a-zA-Z0-9_-]{12,}/g, '[REDACTED]')
    .slice(0, 280);
}

export async function ingestEvents(batch: IngestBatch) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const lookup = await client.query(`
      SELECT s.id FROM services s JOIN projects p ON p.id = s.project_id
      WHERE p.slug=$1 AND s.code=$2 AND s.enabled=true`,
      [batch.project_slug, batch.service_code]);
    const serviceId = lookup.rows[0]?.id;
    if (!serviceId) throw new AppError('SERVICE_NOT_FOUND', 404, 'Serviço não encontrado ou desabilitado.');

    let inserted = 0;
    for (const event of batch.events) {
      const result = await client.query(`
        INSERT INTO diagnostic_events
        (service_id,event_uid,observed_at,level,success,http_status,duration_ms,error_code,message)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        ON CONFLICT (service_id,event_uid) DO NOTHING`, [
        serviceId, event.event_uid, event.observed_at, event.level, event.success,
        event.http_status, event.duration_ms, redact(event.error_code)?.slice(0,70) ?? null, redact(event.message)
      ]);
      inserted += result.rowCount ?? 0;
    }
    await client.query('COMMIT');
    return { received: batch.events.length, inserted, duplicates: batch.events.length - inserted };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
