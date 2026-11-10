import { db } from '../config/db.js';
import { randomUUID } from 'node:crypto';
import { AppError } from '../core/errors.js';
import { encryptSecret, decryptSecret, validateEndpointAddress } from './security.js';
import { mapRemoteRecord, readField } from './mapper.js';
import { ingestEvents } from '../services/ingest.service.js';
import type { ConnectorInput, FieldMapping } from './schema.js';
import type { PoolClient } from 'pg';

type ConnectorRow = {
  id: number; service_id: number; name: string; endpoint_url: string; mode: 'JSON_LOGS'|'HTTP_CHECK'; records_path: string;
  field_mapping: FieldMapping; auth_type: 'NONE'|'BEARER'|'API_KEY'; auth_header: string|null;
  encrypted_secret: string|null; pagination_mode: 'NONE'|'PAGE'; page_parameter: string;
  page_start: number; max_pages: number; page_size_parameter: string|null;
  page_size: number; enabled: boolean; project_slug: string; service_code: string;
};

function publicConnector<T extends { encrypted_secret?: string|null }>(row: T) {
  const { encrypted_secret, ...publicFields } = row;
  return { ...publicFields, has_secret: Boolean(encrypted_secret) };
}

export async function listConnectors() {
  const result = await db.query(`
    SELECT c.*, s.name AS service_name, s.code AS service_code,
           p.name AS project_name, p.slug AS project_slug
    FROM connectors c
    JOIN services s ON s.id=c.service_id
    JOIN projects p ON p.id=s.project_id
    ORDER BY p.name, s.name, c.name`);
  return result.rows.map(publicConnector);
}

async function loadConnector(id: number): Promise<ConnectorRow> {
  const result = await db.query(`
    SELECT c.*, s.code AS service_code, p.slug AS project_slug
    FROM connectors c
    JOIN services s ON s.id=c.service_id AND s.enabled=true
    JOIN projects p ON p.id=s.project_id
    WHERE c.id=$1`, [id]);
  const row = result.rows[0];
  if (!row) throw new AppError('CONNECTOR_NOT_FOUND', 404, 'Conexão não encontrada ou serviço desabilitado.');
  return row as ConnectorRow;
}

export async function saveConnector(input: ConnectorInput, id?: number) {
  const previous = id ? await loadConnector(id) : null;
  const encrypted = input.auth_type === 'NONE' ? null
    : input.auth_secret ? encryptSecret(input.auth_secret)
    : previous?.auth_type === input.auth_type ? previous.encrypted_secret : null;
  if (input.auth_type !== 'NONE' && !encrypted) {
    throw new AppError('CONNECTOR_SECRET_REQUIRED', 400, 'Informe a credencial para o tipo de autenticação escolhido.');
  }
  const params = [input.service_id, input.name, input.endpoint_url, input.mode, input.records_path,
    JSON.stringify(input.field_mapping), input.auth_type, input.auth_header,
    encrypted, input.pagination_mode, input.page_parameter, input.page_start,
    input.max_pages, input.page_size_parameter, input.page_size, input.enabled];
  try {
    if (id) {
      const r = await db.query(`
        UPDATE connectors SET service_id=$1,name=$2,endpoint_url=$3,mode=$4,records_path=$5,
          field_mapping=$6::jsonb,auth_type=$7,auth_header=$8,encrypted_secret=$9,
          pagination_mode=$10,page_parameter=$11,page_start=$12,max_pages=$13,
          page_size_parameter=$14,page_size=$15,enabled=$16,updated_at=now()
        WHERE id=$17 RETURNING *`, [...params, id]);
      if (!r.rowCount) throw new AppError('CONNECTOR_NOT_FOUND',404,'Conexão não encontrada.');
      return publicConnector(r.rows[0]);
    }
    const r = await db.query(`
      INSERT INTO connectors(service_id,name,endpoint_url,mode,records_path,field_mapping,auth_type,
        auth_header,encrypted_secret,pagination_mode,page_parameter,page_start,max_pages,
        page_size_parameter,page_size,enabled)
      VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
      RETURNING *`, params);
    return publicConnector(r.rows[0]);
  } catch (error) {
    if (typeof error === 'object' && error && 'code' in error && error.code === '23505') {
      throw new AppError('CONNECTOR_EXISTS',409,'Já existe uma conexão com esse nome neste serviço.');
    }
    if (typeof error === 'object' && error && 'code' in error && error.code === '23503') {
      throw new AppError('SERVICE_NOT_FOUND',404,'Serviço não encontrado.');
    }
    throw error;
  }
}

export async function deleteConnector(id: number) {
  const count = await db.query('SELECT 1 FROM connector_sync_runs WHERE connector_id=$1 LIMIT 1', [id]);
  if (count.rowCount) throw new AppError('CONNECTOR_HAS_HISTORY',409,'A conexão possui histórico. Desabilite-a em vez de excluir.');
  const deleted = await db.query('DELETE FROM connectors WHERE id=$1 RETURNING id', [id]);
  if (!deleted.rowCount) throw new AppError('CONNECTOR_NOT_FOUND',404,'Conexão não encontrada.');
  return {deleted:true};
}

export async function listConnectorRuns(id: number) {
  await loadConnector(id);
  const result = await db.query(`SELECT id,status,received,inserted,duplicates,skipped,error_code,started_at,finished_at
    FROM connector_sync_runs WHERE connector_id=$1 ORDER BY id DESC LIMIT 20`,[id]);
  return result.rows;
}

async function requestEndpoint(connector: ConnectorRow, pageOffset: number) {
  const url = await validateEndpointAddress(connector.endpoint_url);
  if (connector.mode === 'JSON_LOGS' && connector.pagination_mode === 'PAGE') {
    url.searchParams.set(connector.page_parameter, String(connector.page_start + pageOffset));
    if (connector.page_size_parameter) url.searchParams.set(connector.page_size_parameter, String(connector.page_size));
  }
  const headers: Record<string,string> = { accept:'application/json' };
  if (connector.encrypted_secret && connector.auth_type !== 'NONE') {
    const secret = decryptSecret(connector.encrypted_secret);
    if (connector.auth_type === 'BEARER') headers.authorization = `Bearer ${secret}`;
    if (connector.auth_type === 'API_KEY' && connector.auth_header) headers[connector.auth_header] = secret;
  }
  const start = Date.now();
  try {
    const response = await fetch(url, {method:'GET',headers,redirect:'error',signal:AbortSignal.timeout(8000)});
    return {response,duration_ms:Date.now()-start};
  } catch {
    throw new AppError('CONNECTOR_NETWORK_ERROR',502,'Falha de conexão, redirecionamento ou timeout no endpoint.');
  }
}

async function fetchRemote(connector: ConnectorRow, pageOffset: number) {
  const {response} = await requestEndpoint(connector,pageOffset);
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new AppError('CONNECTOR_HTTP_ERROR',502,`O endpoint respondeu HTTP ${response.status}.`);
  }
  const mediaType = response.headers.get('content-type') || '';
  if (!mediaType.toLowerCase().includes('json')) {
    await response.body?.cancel().catch(() => undefined);
    throw new AppError('CONNECTOR_NOT_JSON',422,'O endpoint não respondeu JSON.');
  }
  const reader = response.body?.getReader();
  if (!reader) throw new AppError('CONNECTOR_EMPTY_RESPONSE',422,'Resposta vazia.');
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > 1024*1024) throw new AppError('CONNECTOR_BODY_TOO_LARGE',413,'Resposta acima de 1 MB.');
      chunks.push(next.value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    if (error instanceof AppError) throw error;
    throw new AppError('CONNECTOR_READ_ERROR',502,'Falha ao ler resposta JSON do endpoint.');
  } finally { reader.releaseLock(); }
  let data: unknown;
  try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new AppError('CONNECTOR_INVALID_JSON',422,'O endpoint retornou JSON inválido.'); }
  const records = readField(data, connector.records_path);
  if (!Array.isArray(records)) throw new AppError('CONNECTOR_RECORDS_PATH_INVALID',422,'O caminho dos registros não aponta para um array.');
  if (records.length > 200) throw new AppError('CONNECTOR_PAGE_TOO_LARGE',422,'O endpoint retornou mais de 200 registros por página.');
  return records;
}

async function probeEndpoint(connector: ConnectorRow) {
  const started = Date.now();
  try {
    const {response,duration_ms} = await requestEndpoint(connector,0);
    await response.body?.cancel().catch(() => undefined);
    return {reachable:true,http_status:response.status,duration_ms,success:response.status < 400};
  } catch(error) {
    if (error instanceof AppError && error.code === 'CONNECTOR_NETWORK_ERROR') {
      return {reachable:false,http_status:null,duration_ms:Math.min(Date.now()-started,600000),success:false};
    }
    throw error;
  }
}

export async function testConnector(id: number) {
  const connector = await loadConnector(id);
  if (connector.mode === 'HTTP_CHECK') return await probeEndpoint(connector);
  const started = Date.now();
  const records = await fetchRemote(connector,0);
  return {reachable:true, records_found:records.length, valid_events:records.filter(r => mapRemoteRecord(r,connector.field_mapping,id) !== null).length,
    duration_ms:Date.now()-started };
}

let activeSynchronizations = 0;

export async function syncConnector(id: number) {
  if (activeSynchronizations >= 2) {
    throw new AppError('CONNECTOR_SYNC_LIMIT',429,'Limite de sincronizações simultâneas atingido.');
  }
  activeSynchronizations += 1;
  let client: PoolClient | undefined;
  let locked = false;
  let runId: number | undefined;
  let received=0,inserted=0,duplicates=0,skipped=0;
  try {
    client = await db.connect();
    const lock = await client.query('SELECT pg_try_advisory_lock(83572,$1) AS acquired',[id]);
    locked = Boolean(lock.rows[0]?.acquired);
    if (!locked) throw new AppError('CONNECTOR_SYNC_RUNNING',409,'Já existe sincronização em andamento para esta conexão.');
    const connector = await loadConnector(id);
    if (!connector.enabled) throw new AppError('CONNECTOR_DISABLED',409,'Conexão desabilitada.');
    const created = await db.query(`INSERT INTO connector_sync_runs(connector_id,status)
      VALUES ($1,'running') RETURNING id`, [id]);
    runId=Number(created.rows[0].id);
    if (connector.mode === 'HTTP_CHECK') {
      const probe = await probeEndpoint(connector);
      received=1;
      const status = probe.http_status;
      const event = {
        event_uid:randomUUID(),observed_at:new Date().toISOString(),
        level:probe.success?'INFO' as const:'ERROR' as const,
        success:probe.success,http_status:status,duration_ms:probe.duration_ms,
        error_code:!probe.reachable?'CONNECTION_FAILED':!probe.success?`HTTP_${status}`:null,
        message:null
      };
      const result = await ingestEvents({project_slug:connector.project_slug,service_code:connector.service_code,events:[event]});
      inserted=result.inserted;duplicates=result.duplicates;
    } else {
      const pages = connector.pagination_mode === 'PAGE' ? connector.max_pages : 1;
      for (let page=0;page<pages;page++) {
        const records = await fetchRemote(connector,page);
        received += records.length;
        const valid = records.map(record=>mapRemoteRecord(record,connector.field_mapping,id)).filter(item=>item !== null);
        skipped += records.length-valid.length;
        if (valid.length) {
          const result = await ingestEvents({project_slug:connector.project_slug,service_code:connector.service_code,events:valid});
          inserted += result.inserted;
          duplicates += result.duplicates;
        }
        if (!records.length || connector.pagination_mode === 'NONE' || records.length < connector.page_size) break;
      }
    }
    await db.query(`UPDATE connector_sync_runs SET status='completed',received=$2,inserted=$3,duplicates=$4,
      skipped=$5,finished_at=now() WHERE id=$1`,[runId,received,inserted,duplicates,skipped]);
    await db.query('UPDATE connectors SET last_success_at=now() WHERE id=$1',[id]);
    return {run_id:runId,status:'completed',received,inserted,duplicates,skipped};
  } catch (error) {
    if (runId) {
      const code = error instanceof AppError ? error.code : 'CONNECTOR_UNEXPECTED_ERROR';
      await db.query(`UPDATE connector_sync_runs SET status='failed',received=$2,inserted=$3,duplicates=$4,
        skipped=$5,error_code=$6,finished_at=now() WHERE id=$1`,[runId,received,inserted,duplicates,skipped,code]).catch(()=>undefined);
    }
    throw error;
  } finally {
    if (locked && client) await client.query('SELECT pg_advisory_unlock(83572,$1)',[id]).catch(()=>undefined);
    client?.release();
    activeSynchronizations -= 1;
  }
}
