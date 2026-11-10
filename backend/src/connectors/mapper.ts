import { createHash } from 'node:crypto';
import { ingestEvent } from '../core/validation.js';
import type { FieldMapping } from './schema.js';

export function readField(value: unknown, path: string): unknown {
  if (!path) return value;
  let current = value;
  for (const part of path.split('.')) {
    if (current === null || typeof current !== 'object' || !Object.hasOwn(current, part)) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function booleanValue(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1' || value === 'true' || value === 'TRUE' || value === 'S') return true;
  if (value === 0 || value === '0' || value === 'false' || value === 'FALSE' || value === 'N') return false;
  return null;
}

function numberValue(value: unknown): number | null {
  if (value === '' || value === undefined || value === null || typeof value === 'boolean') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function optionalText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const text = String(value).trim();
  return text ? text.slice(0, maxLength) : null;
}

export function mapRemoteRecord(record: unknown, mapping: FieldMapping, connectorId: number) {
  if (!record || Array.isArray(record) || typeof record !== 'object') return null;
  const observed = readField(record, mapping.observed_at);
  const duration = numberValue(readField(record, mapping.duration_ms));
  const httpStatus = numberValue(readField(record, mapping.http_status));
  const declaredSuccess = booleanValue(readField(record, mapping.success));
  const success = declaredSuccess ?? (httpStatus !== null ? httpStatus < 400 : null);
  if (success === null || duration === null || !Number.isInteger(duration) || duration < 0 || duration > 600000) return null;
  if (httpStatus !== null && (!Number.isInteger(httpStatus) || httpStatus < 100 || httpStatus > 599 || success !== (httpStatus < 400))) return null;
  if (typeof observed !== 'string' || !Number.isFinite(Date.parse(observed))) return null;
  const timestamp = new Date(observed).toISOString();
  const externalUid = readField(record, mapping.event_uid);
  const fingerprint = externalUid === undefined || externalUid === null || externalUid === ''
    ? JSON.stringify(record)
    : String(externalUid);
  const event_uid = createHash('sha256').update(`${connectorId}:${fingerprint}`).digest('hex');
  const event = {
    event_uid,
    observed_at: timestamp,
    success,
    level: success ? 'INFO' : 'ERROR',
    http_status: httpStatus,
    duration_ms: duration,
    error_code: optionalText(readField(record, mapping.error_code), 70),
    message: optionalText(readField(record, mapping.message), 280)
  };
  const checked = ingestEvent.safeParse(event);
  return checked.success ? checked.data : null;
}
