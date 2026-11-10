import { useEffect,useState } from 'react';
import { Clock3 } from 'lucide-react';
import { api,formatDate,type Analysis } from '../lib/api';
import { Diagnosis } from '../components/Diagnosis';

export function History(){
  const [items,setItems]=useState<Analysis[]>([]);
  const [selected,setSelected]=useState<Analysis|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  useEffect(()=>{api.analyses().then(r=>setItems(r.items)).catch(e=>setError(e.message)).finally(()=>setLoading(false))},[]);
  async function open(id:number){try{setSelected(await api.analysis(id))}catch(e){setError(e instanceof Error?e.message:'Erro ao carregar.')}}
  return <><div className="page-header"><div><div className="eyebrow"><Clock3 size={13}/> AUDITORIA</div><h1>Histórico de análises</h1><p>Consultas realizadas, provedor, modelo e evidências utilizadas.</p></div></div>
    {error&&<div className="error-box">{error}</div>}{loading&&<p className="subtle">Carregando histórico...</p>}
    <div className="history-layout"><section className="panel"><div className="panel-heading"><h3>Diagnósticos realizados</h3><span className="counter">{items.length}</span></div>
      {items.length ? <div className="history-list">{items.map(a=><button className={`history-item ${selected?.id===a.id?'selected':''}`} key={a.id} onClick={()=>open(a.id)}><span className="history-icon"><Clock3 size={16}/></span><span className="history-text"><strong>{a.service_name}</strong><small>{a.project_name} · {formatDate(a.created_at)}</small><small>{a.provider} / {a.model}</small></span><span className={`pill ${a.status==='completed'?'active':a.status==='failed'?'failed':'warning'}`}>{a.status}</span></button>)}</div> : <div className="empty compact">Nenhuma análise realizada ainda.</div>}</section>
      <Diagnosis analysis={selected}/></div>
  </>;
}
