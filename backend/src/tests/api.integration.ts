import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { app } from '../app.js';
import { db } from '../config/db.js';
import { config } from '../config/env.js';

const slug = `integration-test-${randomUUID().slice(0,8)}`;
const secret = config.INGEST_API_KEY;
let serviceId = 0;

afterAll(async () => {
  await db.query('DELETE FROM ai_analyses WHERE service_id=$1',[serviceId]);
  await db.query('DELETE FROM diagnostic_events WHERE service_id=$1',[serviceId]);
  await db.query('DELETE FROM services WHERE id=$1',[serviceId]);
  await db.query('DELETE FROM projects WHERE slug=$1',[slug]);
  await db.end();
});

describe('API and PostgreSQL integration', () => {
  it('health checks the database', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('protects administrative endpoints with an ingestion key', async () => {
    const denied = await request(app).post('/api/projects').send({slug,name:'Test project'});
    expect(denied.status).toBe(401);

    const created = await request(app).post('/api/projects').set('x-ingest-key',secret).send({
      slug,name:'Test project'
    });
    expect(created.status).toBe(201);
    expect(created.body.slug).toBe(slug);

    const service = await request(app).post('/api/services').set('x-ingest-key',secret).send({
      project_slug:slug,code:'test-endpoint',name:'Test endpoint',type:'REST_API'
    });
    expect(service.status).toBe(201);
    serviceId = Number(service.body.id);
  });

  it('ingests events idempotently and calculates evidence metrics', async () => {
    const batch = {project_slug:slug,service_code:'test-endpoint',events:[{
      event_uid:'test-event-1',observed_at:new Date().toISOString(),level:'ERROR',
      success:false,http_status:429,duration_ms:440,error_code:'RATE_LIMIT'
    }]};
    const first = await request(app).post('/api/events/batch').set('x-ingest-key',secret).send(batch);
    expect(first.status).toBe(201);
    expect(first.body.inserted).toBe(1);
    const second = await request(app).post('/api/events/batch').set('x-ingest-key',secret).send(batch);
    expect(second.body.inserted).toBe(0);
    expect(second.body.duplicates).toBe(1);

    const overview = await request(app).get('/api/overview?days=14');
    expect(overview.status).toBe(200);
    expect(overview.body.total).toBeGreaterThan(0);

    const metrics = await request(app).get(`/api/services/${serviceId}/metrics?days=7`);
    expect(metrics.status).toBe(200);
    expect(metrics.body.total).toBe(1);
    expect(metrics.body.failed).toBe(1);
    expect(metrics.body.error_distribution).toContainEqual({code:429,count:1});

    const evidence = await request(app).get(`/api/services/${serviceId}/evidences?days=7`);
    expect(evidence.status).toBe(200);
    expect(evidence.body.period_days).toBe(7);
    expect(evidence.body.evidences.map((item:{id:string}) => item.id)).toContain('EV-429');
  });

  it('records an AI failure instead of faking a response when not configured', async () => {
    if (config.LLM_PROVIDER === 'ollama' || config.GROQ_API_KEY || config.GEMINI_API_KEY) return;
    const result = await request(app).post(`/api/services/${serviceId}/analyze`).send({days:7});
    expect(result.status).toBe(503);
    expect(result.body.error.code).toBe('LLM_NOT_CONFIGURED');
    const history = await request(app).get(`/api/analyses?service_id=${serviceId}`);
    expect(history.status).toBe(200);
    expect(history.body.items[0].status).toBe('failed');
  });
});
