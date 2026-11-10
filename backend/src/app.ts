import express, { type ErrorRequestHandler } from 'express';
import helmet from 'helmet';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { config } from './config/env.js';
import { db } from './config/db.js';
import { AppError, normalizeError } from './core/errors.js';
import { positiveId, periodDays, pageNumber, ingestBatch, createProjectSchema, createServiceSchema } from './core/validation.js';
import { listProjects, listServices, findService, createProject, createService } from './services/catalog.service.js';
import { getMetrics, getServiceMetrics, listEvents } from './services/metrics.service.js';
import { ingestEvents } from './services/ingest.service.js';
import { analyzeService, getAnalysisById, listAnalyses } from './services/diagnostics.service.js';
import { getProviderInfo } from './ai/provider.js';
import { getEvidenceReport } from './demo/evidence.js';
import { connectorInputSchema } from './connectors/schema.js';
import { listConnectors, saveConnector, deleteConnector, testConnector, syncConnector, listConnectorRuns } from './connectors/service.js';

export const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(express.json({limit:'512kb'}));

function asyncRoute(fn: express.RequestHandler): express.RequestHandler {
  return (req,res,next) => Promise.resolve(fn(req,res,next)).catch(next);
}

function getId(value: unknown): number {
  return positiveId.parse(value);
}
function getDays(value: unknown): number {
  return periodDays.parse(value);
}
function sameSecret(a: string, b: string): boolean {
  const aa = Buffer.from(a); const bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa,bb);
}

const counters = new Map<string,{count:number; reset:number}>();
function limitAnalysis(req: express.Request, _res: express.Response, next: express.NextFunction) {
  const key = req.ip || 'local';
  const now = Date.now();
  for (const [k,v] of counters) if (v.reset <= now) counters.delete(k);
  const counter = counters.get(key) ?? {count:0,reset:now+600000};
  if (counter.count >= 10) return next(new AppError('LOCAL_RATE_LIMIT',429,'Limite local de 10 análises a cada 10 minutos.'));
  counter.count += 1;
  counters.set(key,counter);
  next();
}

function requireIngestKey(req: express.Request, _res: express.Response, next: express.NextFunction) {
  const secret = req.get('x-ingest-key') || '';
  if (!sameSecret(secret,config.INGEST_API_KEY)) return next(new AppError('UNAUTHORIZED',401,'Chave de ingestão inválida.'));
  next();
}

app.get('/api/connectors',requireIngestKey,asyncRoute(async (_req,res) => {
  res.json({items:await listConnectors()});
}));
app.post('/api/connectors',requireIngestKey,asyncRoute(async (req,res) => {
  res.status(201).json(await saveConnector(connectorInputSchema.parse(req.body)));
}));
app.put('/api/connectors/:id',requireIngestKey,asyncRoute(async (req,res) => {
  res.json(await saveConnector(connectorInputSchema.parse(req.body),getId(req.params.id)));
}));
app.delete('/api/connectors/:id',requireIngestKey,asyncRoute(async (req,res) => {
  res.json(await deleteConnector(getId(req.params.id)));
}));
app.post('/api/connectors/:id/test',requireIngestKey,asyncRoute(async (req,res) => {
  res.json(await testConnector(getId(req.params.id)));
}));
app.post('/api/connectors/:id/sync',requireIngestKey,asyncRoute(async (req,res) => {
  res.json(await syncConnector(getId(req.params.id)));
}));
app.get('/api/connectors/:id/runs',requireIngestKey,asyncRoute(async (req,res) => {
  res.json({items:await listConnectorRuns(getId(req.params.id))});
}));

app.get('/api/health',asyncRoute(async (_req,res) => {
  await db.query('SELECT 1');
  res.json({ok:true, database:'connected'});
}));

app.get('/api/ai/status',(_req,res) => res.json(getProviderInfo()));
app.get('/api/projects',asyncRoute(async (_req,res) => res.json({items:await listProjects()})));
app.post('/api/projects',requireIngestKey,asyncRoute(async (req,res) => {
  res.status(201).json(await createProject(createProjectSchema.parse(req.body)));
}));
app.post('/api/services',requireIngestKey,asyncRoute(async (req,res) => {
  res.status(201).json(await createService(createServiceSchema.parse(req.body)));
}));
app.get('/api/services',asyncRoute(async (req,res) => {
  const projectId = req.query.project_id ? getId(req.query.project_id) : undefined;
  res.json({items:await listServices(projectId)});
}));
app.get('/api/overview',asyncRoute(async (req,res) => {
  const days = getDays(req.query.days);
  const projectId = req.query.project_id ? getId(req.query.project_id) : undefined;
  res.json(await getMetrics({days,projectId}));
}));
app.get('/api/services/:id/metrics',asyncRoute(async (req,res) =>
  res.json(await getServiceMetrics(getId(req.params.id),getDays(req.query.days)))));
app.get('/api/services/:id/evidences',asyncRoute(async (req,res) => {
  res.json(await getEvidenceReport(getId(req.params.id), getDays(req.query.days)));
}));
app.get('/api/services/:id/events',asyncRoute(async (req,res) => {
  const id = getId(req.params.id);
  if (!await findService(id)) throw new AppError('SERVICE_NOT_FOUND',404,'Serviço não encontrado.');
  res.json(await listEvents(id,pageNumber.parse(req.query.page)));
}));
app.post('/api/services/:id/analyze',limitAnalysis,asyncRoute(async (req,res) => {
  res.status(201).json(await analyzeService(getId(req.params.id),getDays(req.body?.days)));
}));
app.get('/api/analyses',asyncRoute(async (req,res) => {
  res.json({items:await listAnalyses(req.query.service_id ? getId(req.query.service_id) : undefined)});
}));
app.get('/api/analyses/:id',asyncRoute(async (req,res) =>
  res.json(await getAnalysisById(getId(req.params.id)))));
app.post('/api/events/batch',requireIngestKey,asyncRoute(async (req,res) => {
  res.status(201).json(await ingestEvents(ingestBatch.parse(req.body)));
}));
app.use((_req,_res,next) => next(new AppError('NOT_FOUND',404,'Rota não encontrada.')));

const errorHandler: ErrorRequestHandler = (error,_req,res,_next) => {
  if (error instanceof z.ZodError || error instanceof SyntaxError && 'body' in error) {
    res.status(400).json({error:{code:'VALIDATION_ERROR',message:'Parâmetros ou JSON inválidos.'}});
    return;
  }
  if (error?.type === 'entity.too.large') {
    res.status(413).json({error:{code:'BODY_TOO_LARGE',message:'Payload excede 512 KB.'}});
    return;
  }
  const normalized = normalizeError(error);
  if (normalized.statusCode >= 500) console.error(JSON.stringify({event:'api_error',code:normalized.code}));
  res.status(normalized.statusCode).json({error:{code:normalized.code,message:normalized.message}});
};
app.use(errorHandler);
