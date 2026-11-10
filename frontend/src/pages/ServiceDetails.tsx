import { useEffect,useState } from 'react';
import { ArrowLeft, BrainCircuit, CircleAlert } from 'lucide-react';
import { api, formatDate, type Analysis, type Event,type Metrics,type Service, type EvidenceReport } from '../lib/api';
import { Charts } from '../components/Charts';
import { SummaryCards } from '../components/SummaryCards';
import { Diagnosis } from '../components/Diagnosis';
import { EvidencePanel } from '../components/EvidencePanel';

export function ServiceDetails({service,onBack}:{service:Service;onBack:()=>void}) {
  const [days,setDays]=useState(14);
  const [metrics,setMetrics]=useState<Metrics | null>(null);
  const [events,setEvents]=useState<Event[]>([]);
  const [evidence,setEvidence]=useState<EvidenceReport | null>(null);
  const [analysis,setAnalysis]=useState<Analysis | null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(true);
  useEffect(()=>{
    let live=true;setLoading(true);setError('');setAnalysis(null);setEvidence(null);
    Promise.all([api.metrics(service.id,days),api.events(service.id),api.evidences(service.id,days)]).then(([m,e,report])=>{
      if(live){setMetrics(m);setEvents(e.items);setEvidence(report)}
    }).catch(e=>{if(live)setError(e.message)}).finally(()=>{if(live)setLoading(false)});
    return()=>{live=false};
  },[service.id,days]);
  async function analyze(){
    setBusy(true);setError('');
    try{setAnalysis(await api.analyze(service.id,days))}
    catch(e){setError(e instanceof Error?e.message:'Não foi possível analisar.')}
    finally{setBusy(false)}
  }
  return <>
    <button className="back-link" onClick={onBack}><ArrowLeft size={16}/> Voltar ao dashboard</button>
    <div className="page-header"><div><div className="eyebrow">{service.project_name} / {service.type.replace('_',' ')}</div><h1>{service.name}</h1><p>Observabilidade, execuções e investigação orientada por evidências.</p></div>
      <div className="filters"><select aria-label="Período" value={days} onChange={e=>setDays(Number(e.target.value))}><option value={7}>Últimos 7 dias</option><option value={14}>Últimos 14 dias</option><option value={30}>Últimos 30 dias</option></select>
      <button className="primary-button" disabled={busy||loading||!metrics?.total} onClick={analyze}><BrainCircuit size={18}/>{busy?'Analisando...':'Analisar com IA'}</button></div></div>
    {service.project_slug === 'ai-diagnostics-showcase' && <div className="demo-notice" role="note">
      Cenário de demonstração: estes eventos são sintéticos e foram criados localmente para testar as regras de diagnóstico.
    </div>}
    {error && <div className="error-box" role="alert"><CircleAlert size={17}/>{error}</div>}
    {loading && <p className="subtle">Carregando dados do serviço...</p>}
    {metrics && <><SummaryCards data={metrics}/><Charts data={metrics}/></>}
    <EvidencePanel report={evidence}/>
    <Diagnosis analysis={analysis}/>
    <section className="panel"><div className="panel-heading"><div><h3>Eventos recentes</h3><p>Últimos 30 registros deste serviço</p></div></div>
      <div className="table-wrap"><table><thead><tr><th>Data e hora</th><th>Resultado</th><th>HTTP</th><th>Duração</th><th>Tipo de erro</th></tr></thead><tbody>{events.map(e=><tr key={e.id}><td>{formatDate(e.observed_at)}</td><td><span className={`pill ${e.success?'active':'failed'}`}>{e.success?'Sucesso':'Falha'}</span></td><td>{e.http_status ?? '—'}</td><td>{e.duration_ms} ms</td><td>{e.error_code ?? '—'}</td></tr>)}</tbody></table>
      {!events.length&&<div className="empty compact">Não existem eventos para este serviço.</div>}</div>
    </section>
  </>;
}
