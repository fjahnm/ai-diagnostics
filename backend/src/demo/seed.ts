import { db } from '../config/db.js';
import { buildDemoScenarios, DEMO_PROJECT } from './scenarios.js';
import { requireLocalDemoDatabase } from './local-only.js';

async function main() {
  requireLocalDemoDatabase();
  const scenarios = buildDemoScenarios();
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(91012, 1)');
    await client.query(`INSERT INTO projects (slug, name, description)
      VALUES ($1, $2, $3) ON CONFLICT (slug) DO NOTHING`,
      [DEMO_PROJECT.slug, DEMO_PROJECT.name, DEMO_PROJECT.description]);
    const project = await client.query('SELECT id, name FROM projects WHERE slug=$1 FOR UPDATE', [DEMO_PROJECT.slug]);
    if (project.rows[0]?.name !== DEMO_PROJECT.name) {
      throw new Error('O identificador da demonstração já pertence a outro projeto. Nenhum dado foi alterado.');
    }
    const projectId = Number(project.rows[0].id);
    // O seed nunca assume controle de serviços ou conexões não previstos.
    const existingServices = await client.query('SELECT id, code FROM services WHERE project_id=$1', [projectId]);
    if (existingServices.rows.some(row => !scenarios.some(s => s.code === row.code))) {
      throw new Error('Há serviços não previstos no projeto de demonstração. Nenhum dado foi alterado.');
    }
    const linkedConnectors = await client.query(`SELECT COUNT(*)::int AS total
      FROM connectors c JOIN services s ON s.id=c.service_id WHERE s.project_id=$1`, [projectId]);
    if (linkedConnectors.rows[0].total > 0) {
      throw new Error('O projeto de demonstração possui conexões configuradas. Nenhum dado foi alterado.');
    }
    for (const scenario of scenarios) {
      await client.query(`INSERT INTO services (project_id, code, name, type)
        VALUES ($1,$2,$3,$4) ON CONFLICT (project_id,code) DO NOTHING`,
        [projectId,scenario.code,scenario.name,scenario.type]);
      const result = await client.query(`SELECT id, name, type FROM services
        WHERE project_id=$1 AND code=$2 FOR UPDATE`, [projectId, scenario.code]);
      const service = result.rows[0];
      if (service.name !== scenario.name || service.type !== scenario.type) {
        throw new Error(`O serviço ${scenario.code} possui dados diferentes dos previstos. Nenhum dado foi alterado.`);
      }
      const id = Number(service.id);
      await client.query('DELETE FROM ai_analyses WHERE service_id=$1', [id]);
      await client.query('DELETE FROM diagnostic_events WHERE service_id=$1', [id]);
      await client.query(`INSERT INTO diagnostic_events
        (service_id,event_uid,observed_at,level,success,http_status,duration_ms,error_code,message)
        SELECT $1, e.event_uid, e.observed_at, e.level, e.success, e.http_status, e.duration_ms, e.error_code, e.message
        FROM jsonb_to_recordset($2::jsonb) AS e (
          event_uid text, observed_at timestamptz, level text, success boolean,
          http_status smallint, duration_ms integer, error_code text, message text
        )`, [id, JSON.stringify(scenario.events)]);
    }
    await client.query('COMMIT');
    console.log(`Demonstração criada no projeto "${DEMO_PROJECT.name}".`);
    for (const scenario of scenarios) {
      console.log(`- ${scenario.name}: ${scenario.expected.total} eventos, ${scenario.expected.failed} falhas`);
    }
    console.log('Apenas os registros do projeto reservado de demonstração foram substituídos.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await db.end();
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : 'Falha ao gerar a demonstração.');
  process.exitCode = 1;
});
