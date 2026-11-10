import { AlertTriangle, Lightbulb, ShieldCheck, FlaskConical } from 'lucide-react';
import type { Analysis } from '../lib/api';
import { formatDate } from '../lib/api';

export function Diagnosis({analysis}:{analysis:Analysis | null}) {
  if (!analysis) return <div className="panel placeholder-panel"><FlaskConical size={27}/><h3>Diagnóstico inteligente</h3><p>Selecione um serviço e execute a análise para receber hipóteses fundamentadas nas métricas verificadas.</p></div>;
  if (analysis.status !== 'completed' || !analysis.result) return <div className="panel placeholder-panel"><AlertTriangle size={24}/><h3>Diagnóstico não concluído</h3><p>{analysis.error_code || 'A análise está pendente.'}</p></div>;
  const output = analysis.result;
  return <section className="panel diagnosis-panel">
    <div className="panel-heading"><div><span className="eyebrow">ANÁLISE VALIDADA</span><h3>Diagnóstico técnico</h3><p>{analysis.model} · {formatDate(analysis.created_at)}</p></div><span className={`severity severity-${output.gravidade}`}>Gravidade {output.gravidade}</span></div>
    <div className="diagnosis-summary"><ShieldCheck size={20}/><p>{output.resumo}</p></div>
    <h4>Hipóteses e recomendações</h4>
    {output.hipoteses.length ? <div className="hypotheses">{output.hipoteses.map((h,i)=><div className="hypothesis" key={i}>
      <div className="hypothesis-head"><strong>{i+1}. {h.descricao}</strong><span className="tag">Confiança {h.confianca}</span></div>
      <div className="evidence-ids">{h.evidencias.map(id=><span className="evidence-tag" key={id}>{id}</span>)}</div>
      <p><Lightbulb size={15}/> {h.recomendacao}</p>
    </div>)}</div> : <div className="empty compact">Não há hipóteses suficientes para recomendar uma causa.</div>}
    <h4>Evidências verificadas pelo backend</h4>
    <div className="evidence-list">{analysis.evidences_snapshot?.map(e=><div className="evidence-row" key={e.id}><code>{e.id}</code><span>{e.description}</span></div>)}</div>
    {output.limitacoes.length>0 && <div className="limitations"><strong>Limitações da análise</strong><ul>{output.limitacoes.map((v,i)=><li key={i}>{v}</li>)}</ul></div>}
  </section>;
}
