import { db } from '../config/db.js';
import { getServiceMetrics } from '../services/metrics.service.js';
import { detectAnomalies } from '../services/anomalies.service.js';
import { getProviderInfo } from '../ai/provider.js';
import { analyzeService } from '../services/diagnostics.service.js';
import { buildDemoScenarios, DEMO_PROJECT } from './scenarios.js';
import { requireLocalDemoDatabase } from './local-only.js';

async function main() {
  requireLocalDemoDatabase();
  const scenarios = buildDemoScenarios();
  const runModel = process.argv.includes('--llm');
  const lookup = await db.query(`SELECT s.id, s.code FROM services s
    JOIN projects p ON p.id=s.project_id WHERE p.slug=$1`, [DEMO_PROJECT.slug]);
  const ids = new Map<string, number>(lookup.rows.map(row => [row.code, Number(row.id)]));
  const report: Array<{service:string;result:string;details:string}> = [];
  let problems = 0;

  for (const scenario of scenarios) {
    const id = ids.get(scenario.code);
    if (!id) {
      report.push({service:scenario.name,result:'FALHOU',details:'Serviço não encontrado'});
      problems++;
      continue;
    }
    const metrics = await getServiceMetrics(id, 14);
    const actualEvidence = detectAnomalies(metrics).map(item => item.id);
    const expected = scenario.expected;
    const correct = metrics.total === expected.total && metrics.failed === expected.failed
      && JSON.stringify(actualEvidence) === JSON.stringify(expected.evidence);
    report.push({
      service:scenario.name, result:correct ? 'OK' : 'FALHOU',
      details:`eventos=${metrics.total}/${expected.total}, falhas=${metrics.failed}/${expected.failed}, evidências=${actualEvidence.join(',')}`
    });
    if (!correct) problems++;
    if (runModel && correct) {
      const info = getProviderInfo();
      if (!info.configured) throw new Error('Provedor LLM não configurado. Remova --llm ou configure o provedor.');
      const analysis = await analyzeService(id, 14);
      report.push({service:scenario.name,result:'LLM VALIDADO',details:`análise=${analysis.id} | modelo=${info.model}`});
    }
  }
  for (const item of report) console.log(`${item.result.padEnd(12)} ${item.service} — ${item.details}`);
  if (problems) throw new Error(`A avaliação encontrou ${problems} cenários diferentes do esperado.`);
  console.log(runModel ? 'Avaliação determinística e validação de contrato do LLM concluídas.' : 'Avaliação determinística concluída sem enviar dados a provedores externos.');
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : 'Falha na avaliação.');
  process.exitCode = 1;
}).finally(() => db.end());
