import { useCallback,useEffect,useState } from 'react';
import { Activity,History,UploadCloud,Cable,Layers3,Menu } from 'lucide-react';
import { api,type Project,type Service } from './lib/api';
import { Dashboard } from './pages/Dashboard';
import { ServiceDetails } from './pages/ServiceDetails';
import { History as HistoryPage } from './pages/History';
import { ImportEvents } from './pages/ImportEvents';
import { Connections } from './pages/Connections';

type Screen='dashboard'|'service'|'history'|'import'|'connections';
export default function App(){
  const [screen,setScreen]=useState<Screen>('dashboard');
  const [projects,setProjects]=useState<Project[]>([]);
  const [services,setServices]=useState<Service[]>([]);
  const [selected,setSelected]=useState<number|null>(null);
  const [mobileOpen,setMobileOpen]=useState(false);
  const [error,setError]=useState('');
  const refreshCatalog = useCallback(async () => {
    try {
      const [projectsResult, servicesResult] = await Promise.all([api.projects(), api.services()]);
      setProjects(projectsResult.items);
      setServices(servicesResult.items);
      setError('');
    } catch (cause) {setError(cause instanceof Error ? cause.message : 'Falha ao carregar o catálogo.');}
  }, []);
  useEffect(() => {void refreshCatalog();}, [refreshCatalog]);
  function navigate(next:Screen){setScreen(next);setMobileOpen(false)}
  const service=services.find(s=>s.id===selected);
  const menu:[Screen,string,typeof Activity][]=[['dashboard','Visão geral',Activity],['history','Histórico de análises',History],['connections','Conexões',Cable],['import','Importar eventos',UploadCloud]];
  return <div className="layout"><aside className={`sidebar ${mobileOpen?'sidebar-open':''}`}>
    <div className="brand"><div className="brand-mark"><Activity size={20}/></div><div><strong>AI Diagnostics</strong><small>Application intelligence</small></div></div>
    <div className="side-label">PLATAFORMA</div><nav aria-label="Navegação principal">{menu.map(([key,label,Icon])=><button key={key} onClick={()=>navigate(key)} className={`nav-item ${screen===key || (screen==='service'&&key==='dashboard')?'current':''}`}><Icon size={18}/>{label}</button>)}</nav>
    <div className="side-label projects-label">PROJETOS</div><div className="project-nav">{projects.map(p=><div key={p.id} className="project-item"><Layers3 size={15}/>{p.name}</div>)}</div>

  </aside><div className="main-shell"><header className="topbar"><button className="mobile-toggle" aria-label="Abrir menu" onClick={()=>setMobileOpen(x=>!x)}><Menu size={20}/></button><span className="breadcrumb">Workspace <span>/</span> {screen==='dashboard'?'Dashboard':screen==='service'?'Serviço':screen==='history'?'Histórico':screen==='connections'?'Conexões':'Ingestão'}</span><div className="top-right"><span className="avatar">FM</span></div></header>
    <main className="content">{error&&<div className="error-box">{error}</div>}
      {screen==='dashboard'&&<Dashboard projects={projects} services={services} onSelect={id=>{setSelected(id);navigate('service')}}/>}
      {screen==='service'&&service&&<ServiceDetails service={service} onBack={()=>navigate('dashboard')}/>}
      {screen==='history'&&<HistoryPage/>}{screen==='connections'&&<Connections services={services} onCatalogChanged={refreshCatalog}/>} {screen==='import'&&<ImportEvents onCatalogChanged={refreshCatalog}/>}
    </main><footer className="footer">AI Diagnostics · Software observability with evidence-based LLM analysis <span>© 2026 Felipe Macedo</span></footer></div>
  </div>;
}
