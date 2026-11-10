import { useEffect,useState } from 'react';
import { ArrowRight, Activity, Search, Bot } from 'lucide-react';
import { api, type Project,type Service,type Metrics,type ProviderInfo } from '../lib/api';
import { SummaryCards } from '../components/SummaryCards';
import { Charts } from '../components/Charts';

interface Props { projects:Project[]; services:Service[]; onSelect:(id:number)=>void }
export function Dashboard({projects,services,onSelect}:Props) {
  const [project,setProject] = useState(0);
  const [days,setDays] = useState(14);
  const [metrics,setMetrics] = useState<Metrics | null>(null);
  const [provider,setProvider] = useState<ProviderInfo | null>(null);
  const [loading,setLoading] = useState(false);
  const [error,setError] = useState('');
  useEffect(()=>{api.provider().then(setProvider).catch(()=>undefined)},[]);
  useEffect(()=>{
    let active=true;
    setLoading(true);setError('');
    api.overview(days,project || undefined).then(v=>{if(active)setMetrics(v)}).catch(e=>{if(active)setError(e.message)}).finally(()=>{if(active)setLoading(false)});
    return()=>{active=false};
  },[days,project]);
  const visible = project ? services.filter(x=>Number(x.project_id)===project):services;
  const includesDemo = projects.some(item => item.slug === 'ai-diagnostics-showcase' && (!project || item.id === project));
  return <>
    <div className="page-header"><div><div className="eyebrow"><Activity size={13}/> VISÃO OPERACIONAL</div><h1>Monitoramento inteligente</h1><p>Acompanhe os serviços e investigue padrões com IA baseada em evidências.</p></div>
      <div className="filters"><label className="sr-only" htmlFor="project-filter">Projeto</label><select id="project-filter" value={project} onChange={e=>setProject(Number(e.target.value))}><option value={0}>Todos os projetos</option>{projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>
      <label className="sr-only" htmlFor="period-filter">Período</label><select id="period-filter" value={days} onChange={e=>setDays(Number(e.target.value))}><option value={7}>Últimos 7 dias</option><option value={14}>Últimos 14 dias</option><option value={30}>Últimos 30 dias</option></select></div></div>
    {includesDemo && <div className="demo-notice" role="note">
      {project ? 'Projeto demonstrativo: os eventos são sintéticos e não representam sistemas reais.' : 'A visão de todos os projetos inclui eventos sintéticos de demonstração. Selecione um projeto para analisar dados isoladamente.'}
    </div>}
    {error && <div className="error-box" role="alert">{error}</div>}
    {loading && <p className="subtle">Atualizando indicadores...</p>}
    {metrics && <><SummaryCards data={metrics}/><Charts data={metrics}/></>}
    <section className="panel services-panel"><div className="panel-heading"><div><h3>Serviços monitorados</h3><p>Informações consolidadas dos serviços cadastrados</p></div><span className="counter">{visible.length} serviços</span></div>
      {visible.length ? <div className="service-list">{visible.map(s=><button key={s.id} className="service-item" onClick={()=>onSelect(s.id)}>
        <span className="service-symbol"><Search size={19}/></span><span className="service-description"><strong>{s.name}</strong><small>{s.project_name} · {s.type.replace('_',' ')}</small></span><span className="pill active">Monitorado</span><ArrowRight size={17}/></button>)}</div> : <div className="empty">Nenhum serviço cadastrado.</div>}
    </section>
    <div className="provider-strip"><Bot size={18}/><div><strong>Modelo configurado</strong><span>{provider ? `${provider.provider.toUpperCase()} · ${provider.model}` : 'Consultando configuração...'}</span></div><span className={`pill ${provider?.configured ? 'active':'warning'}`}>{provider?.configured?'Configurado':'Não configurado'}</span></div>
  </>;
}
