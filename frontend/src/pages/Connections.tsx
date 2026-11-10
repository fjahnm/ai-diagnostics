import { useEffect, useState } from 'react';
import { Cable, CheckCircle2, CircleAlert, LockKeyhole, Plus, RefreshCw, TestTube2 } from 'lucide-react';
import { api, type Connector, type ConnectorInput, type Service, formatDate } from '../lib/api';

type MappingKey = keyof ConnectorInput['field_mapping'];
const mappingFields: Array<[MappingKey,string]> = [
  ['event_uid','ID único do registro'],
  ['observed_at','Data e hora'],
  ['success','Sucesso (true/false)'],
  ['http_status','Código HTTP'],
  ['duration_ms','Duração em milissegundos'],
  ['error_code','Código do erro'],
  ['message','Mensagem resumida']
];

function emptyConfig(services: Service[]): ConnectorInput {
  return {
    service_id: services[0]?.id ?? 0,
    name: '',
    endpoint_url: '',
    mode: 'JSON_LOGS',
    records_path: 'items',
    auth_type: 'NONE',
    auth_header: null,
    auth_secret: '',
    pagination_mode: 'NONE',
    page_parameter: 'page',
    page_start: 1,
    max_pages: 1,
    page_size_parameter: null,
    page_size: 100,
    enabled: true,
    field_mapping: {
      event_uid: 'id',
      observed_at: 'timestamp',
      success: 'success',
      http_status: 'status_code',
      duration_ms: 'duration_ms',
      error_code: 'error_code',
      message: ''
    }
  };
}

export function Connections({services,onCatalogChanged}: {services: Service[];onCatalogChanged:()=>Promise<void>}) {
  const [key,setKey] = useState('');
  const [items,setItems] = useState<Connector[]>([]);
  const [selected,setSelected] = useState<number|null>(null);
  const [form,setForm] = useState<ConnectorInput>(()=>emptyConfig(services));
  const [error,setError] = useState('');
  const [result,setResult] = useState('');
  const [busy,setBusy] = useState(false);
  const [showCatalog,setShowCatalog] = useState(false);
  const [projectName,setProjectName] = useState('');
  const [projectSlug,setProjectSlug] = useState('');
  const [serviceName,setServiceName] = useState('');
  const [serviceCode,setServiceCode] = useState('');
  const [serviceProjectSlug,setServiceProjectSlug] = useState('');
  const [serviceType,setServiceType] = useState('REST_API');
  const [runs,setRuns] = useState<Array<{id:number;status:string;received:number;inserted:number;duplicates:number;skipped:number;started_at:string;error_code:string|null}>>([]);

  useEffect(()=>{
    if (!form.service_id && services.length) setForm(prev=>({...prev,service_id:services[0].id}));
  },[services,form.service_id]);

  async function load() {
    setError('');setResult('');setBusy(true);
    try {setItems((await api.connectors(key)).items);}
    catch (e) {setError(e instanceof Error ? e.message : 'Erro ao consultar conexões.');}
    finally {setBusy(false);}
  }

  async function registerProject() {
    setBusy(true);setError('');setResult('');
    try {
      const saved = await api.createProject({name:projectName,slug:projectSlug},key);
      setServiceProjectSlug(saved.slug);
      setProjectName('');setProjectSlug('');
      await onCatalogChanged();
      setResult(`Projeto ${saved.name} cadastrado. Cadastre agora o serviço para vinculá-lo à conexão.`);
    } catch (cause) {setError(cause instanceof Error?cause.message:'Falha ao cadastrar projeto.');}
    finally {setBusy(false);}
  }

  async function registerService() {
    setBusy(true);setError('');setResult('');
    try {
      const saved = await api.createService({project_slug:serviceProjectSlug,code:serviceCode,name:serviceName,type:serviceType},key);
      await onCatalogChanged();
      setForm(prev=>({...prev,service_id:saved.id}));
      setServiceName('');setServiceCode('');setShowCatalog(false);
      setResult(`Serviço ${saved.name} cadastrado. Configure a conexão e salve.`);
    } catch (cause) {setError(cause instanceof Error?cause.message:'Falha ao cadastrar serviço.');}
    finally {setBusy(false);}
  }

  function edit(item:Connector) {
    setSelected(item.id);
    setForm({
      service_id:item.service_id,name:item.name,endpoint_url:item.endpoint_url,mode:item.mode,
      records_path:item.records_path,field_mapping:item.field_mapping,
      auth_type:item.auth_type,auth_header:item.auth_header,auth_secret:'',
      pagination_mode:item.pagination_mode,page_parameter:item.page_parameter,
      page_start:item.page_start,max_pages:item.max_pages,
      page_size_parameter:item.page_size_parameter,page_size:item.page_size,
      enabled:item.enabled
    });
    setResult('');setError('');setRuns([]);
    api.connectorRuns(item.id,key).then(r=>setRuns(r.items)).catch(()=>undefined);
  }

  function createNew() {
    setSelected(null);setForm(emptyConfig(services));setRuns([]);setError('');setResult('');
  }

  async function save() {
    setBusy(true);setError('');setResult('');
    try {
      const saved = selected
        ? await api.updateConnector(selected,form,key)
        : await api.createConnector(form,key);
      setSelected(saved.id);
      setForm(prev=>({...prev,auth_secret:''}));
      setItems((await api.connectors(key)).items);
      setResult('Conexão salva. Execute “Testar” antes de sincronizar eventos.');
    } catch (e) {setError(e instanceof Error?e.message:'Falha ao salvar a conexão.');}
    finally {setBusy(false);}
  }

  async function run(action:'test'|'sync') {
    if (selected === null) return;
    setBusy(true);setError('');setResult('');
    try {
      if (action === 'test') {
        const r = await api.testConnector(selected,key);
        setResult(r.http_status !== undefined ? `Verificação concluída: HTTP ${r.http_status ?? 'sem resposta'}, ${r.duration_ms} ms, ${r.success ? 'sucesso' : 'falha'}. Nenhum evento foi gravado.` : `Endpoint acessível em ${r.duration_ms} ms. Registros encontrados: ${r.records_found}. Eventos válidos: ${r.valid_events}.`);
      } else {
        const r = await api.syncConnector(selected,key);
        setResult(`Sincronização concluída: ${r.inserted} incluídos, ${r.duplicates} duplicados e ${r.skipped} descartados de ${r.received} registros.`);
      }
      setRuns((await api.connectorRuns(selected,key)).items);
      setItems((await api.connectors(key)).items);
    } catch (e) {setError(e instanceof Error?e.message:'Falha ao consultar o endpoint.');}
    finally {setBusy(false);}
  }

  const update = <K extends keyof ConnectorInput>(field:K,value:ConnectorInput[K]) =>
    setForm(prev=>({...prev,[field]:value}));
  const mapping = (field:MappingKey,value:string) =>
    setForm(prev=>({...prev,field_mapping:{...prev.field_mapping,[field]:value}}));

  return <>
    <div className="page-header"><div>
      <div className="eyebrow"><Cable size={13}/> INTEGRAÇÕES CONFIGURÁVEIS</div>
      <h1>Conexões externas</h1>
      <p>Consulte logs JSON de outras aplicações sem desenvolver conectores específicos.</p>
    </div></div>
    <section className="panel connector-access">
      <div><h3>Chave de gerenciamento</h3><p className="help-text">Informe a chave de gerenciamento configurada no backend. Ela não será armazenada no navegador.</p></div>
      <div className="connector-key"><LockKeyhole size={18}/><input type="password" className="text-field" value={key} autoComplete="off" placeholder="Chave de gerenciamento" onChange={e=>setKey(e.target.value)}/>
        <button className="secondary-button" disabled={!key||busy} onClick={load}><RefreshCw size={15}/> Carregar</button></div>
    </section>
    <section className="panel connector-access">
      <div><h3>Projetos e serviços</h3><p className="help-text">Cadastre a aplicação que será monitorada e o serviço associado à conexão.</p></div>
      <button className="secondary-button" onClick={()=>setShowCatalog(value=>!value)}><Plus size={15}/>{showCatalog?'Fechar cadastro':'Cadastrar projeto ou serviço'}</button>
    </section>
    {showCatalog && <div className="registration-grid">
      <section className="panel">
        <h3>Novo projeto</h3>
        <label>Nome<input className="text-field" value={projectName} onChange={event=>setProjectName(event.target.value)} placeholder="Minha Aplicação"/></label>
        <label>Identificador<input className="text-field" value={projectSlug} onChange={event=>setProjectSlug(event.target.value)} placeholder="minha-aplicacao"/></label>
        <button className="primary-button" disabled={busy||!key||!projectName.trim()||!projectSlug.trim()} onClick={registerProject}>Criar projeto</button>
      </section>
      <section className="panel">
        <h3>Novo serviço</h3>
        <label>Identificador do projeto<input className="text-field" value={serviceProjectSlug} onChange={event=>setServiceProjectSlug(event.target.value)} placeholder="minha-aplicacao"/></label>
        <label>Nome<input className="text-field" value={serviceName} onChange={event=>setServiceName(event.target.value)} placeholder="API Principal"/></label>
        <label>Identificador<input className="text-field" value={serviceCode} onChange={event=>setServiceCode(event.target.value)} placeholder="api-principal"/></label>
        <label>Tipo<select className="text-field" value={serviceType} onChange={event=>setServiceType(event.target.value)}><option value="REST_API">API REST</option><option value="INTEGRATION">Integração</option><option value="BACKGROUND_JOB">Job agendado</option></select></label>
        <button className="primary-button" disabled={busy||!key||!serviceProjectSlug.trim()||!serviceName.trim()||!serviceCode.trim()} onClick={registerService}>Criar serviço</button>
      </section>
    </div>}
    {!services.length && <p className="help-text">Nenhum serviço cadastrado. Utilize o cadastro acima para adicionar seu primeiro projeto e serviço.</p>}
    <div className="connection-grid">
      <section className="panel connector-list"><div className="panel-heading"><div><h3>Conexões cadastradas</h3><p>Selecione uma conexão para editar, testar ou sincronizar.</p></div></div>
        <button className="secondary-button" disabled={!services.length} onClick={createNew}><Plus size={15}/> Nova conexão</button>
        {items.length === 0 && <p className="help-text">Nenhuma conexão carregada. Informe a chave e clique em Carregar.</p>}
        {items.map(item=><button key={item.id} className={`connector-item ${selected===item.id?'selected':''}`} onClick={()=>edit(item)}>
          <span><strong>{item.name}</strong><small>{item.project_name} / {item.service_name}</small><small>{item.enabled?'Ativa':'Desabilitada'} · {item.last_success_at?`Última sincronização: ${formatDate(item.last_success_at)}`:'Sem sincronização'}</small></span>
          <Cable size={16}/>
        </button>)}
      </section>
      <section className="panel connector-form"><h3>{selected?'Editar conexão':'Nova conexão'}</h3>
        <p className="help-text">Somente requisições GET. O sistema coleta eventos, não executa ações no serviço remoto.</p>
        <div className="connector-fields">
          <label>Serviço monitorado<select className="text-field" value={form.service_id} onChange={e=>update('service_id',Number(e.target.value))}>
            {!services.length&&<option value="0">Cadastre primeiro um serviço</option>}
            {services.map(s=><option value={s.id} key={s.id}>{s.project_name} / {s.name}</option>)}
          </select></label>
          <label>Modo da conexão<select className="text-field" value={form.mode} onChange={e=>update('mode',e.target.value as ConnectorInput['mode'])}>
            <option value="JSON_LOGS">Importar logs JSON</option><option value="HTTP_CHECK">Verificar disponibilidade HTTP</option>
          </select></label>
          <label>Nome da conexão<input className="text-field" value={form.name} onChange={e=>update('name',e.target.value)} placeholder="Logs da API principal"/></label>
          <label className="wide">URL completa do endpoint GET<input className="text-field" type="url" value={form.endpoint_url} onChange={e=>update('endpoint_url',e.target.value)} placeholder="http://127.0.0.1:3000/api/logs"/></label>
          <label>Autenticação<select className="text-field" value={form.auth_type} onChange={e=>{update('auth_type',e.target.value as ConnectorInput['auth_type']);update('auth_header',null)}}>
            <option value="NONE">Sem autenticação</option><option value="BEARER">Bearer Token</option><option value="API_KEY">Chave em cabeçalho</option>
          </select></label>
          {form.auth_type==='API_KEY' && <label>Nome do cabeçalho<input className="text-field" value={form.auth_header??''} onChange={e=>update('auth_header',e.target.value||null)} placeholder="x-api-key"/></label>}
          {form.auth_type!=='NONE' && <label className="wide">Segredo de autenticação<input className="text-field" type="password" autoComplete="new-password" value={form.auth_secret||''} onChange={e=>update('auth_secret',e.target.value)} placeholder={selected?'Deixe vazio para manter a credencial salva':'Informe o token ou a chave'}/></label>}
          {form.mode==='JSON_LOGS'&&<><label>Caminho do array de registros<input className="text-field" value={form.records_path} onChange={e=>update('records_path',e.target.value)} placeholder="items ou data.logs (vazio = raiz)"/></label>
          <label>Paginação<select className="text-field" value={form.pagination_mode} onChange={e=>update('pagination_mode',e.target.value as 'NONE'|'PAGE')}>
            <option value="NONE">Sem paginação</option><option value="PAGE">Por número da página</option>
          </select></label>
          {form.pagination_mode==='PAGE'&&<>
            <label>Parâmetro da página<input className="text-field" value={form.page_parameter} onChange={e=>update('page_parameter',e.target.value)}/></label>
            <label>Página inicial<input className="text-field" type="number" min="0" max="1000" value={form.page_start} onChange={e=>update('page_start',Number(e.target.value))}/></label>
            <label>Máximo de páginas (1–5)<input className="text-field" type="number" min="1" max="5" value={form.max_pages} onChange={e=>update('max_pages',Number(e.target.value))}/></label>
            <label>Parâmetro do tamanho<input className="text-field" value={form.page_size_parameter??''} onChange={e=>update('page_size_parameter',e.target.value||null)} placeholder="pageSize (opcional)"/></label>
            <label>Tamanho da página (1–200)<input className="text-field" type="number" min="1" max="200" value={form.page_size} onChange={e=>update('page_size',Number(e.target.value))}/></label>
          </>}
          </>}
        </div>
        {form.mode==='JSON_LOGS'&&<><h4>Mapeamento dos campos JSON</h4>
        <p className="help-text">Informe o nome do campo remoto. Use ponto para campos internos, como response.status. Campos opcionais podem ficar vazios.</p>
        <div className="connector-fields">
          {mappingFields.map(([field,label])=><label key={field}>{label}<input className="text-field" value={form.field_mapping[field]} onChange={e=>mapping(field,e.target.value)} placeholder={field}/></label>)}
        </div>
        </>}
        <label className="check-field"><input type="checkbox" checked={form.enabled} onChange={e=>update('enabled',e.target.checked)}/> Conexão habilitada</label>
        <div className="connector-actions">
          <button className="primary-button" disabled={busy||!key||!form.service_id||!form.name||!form.endpoint_url} onClick={save}>{busy?'Processando...':'Salvar conexão'}</button>
          <button className="secondary-button" disabled={busy||!key||!selected} onClick={()=>run('test')}><TestTube2 size={15}/> Testar</button>
          <button className="secondary-button" disabled={busy||!key||!selected||!form.enabled} onClick={()=>run('sync')}><RefreshCw size={15}/> Sincronizar</button>
        </div>
        {result&&<div className="success-box"><CheckCircle2 size={16}/>{result}</div>}
        {error&&<div className="error-box"><CircleAlert size={16}/>{error}</div>}
        {runs.length>0&&<div className="connector-runs"><h4>Últimas sincronizações</h4>{runs.slice(0,6).map(run=><div key={run.id}><span>{formatDate(run.started_at)}</span><span>{run.status} · {run.inserted} novos / {run.skipped} ignorados{run.error_code?` · ${run.error_code}`:''}</span></div>)}</div>}
      </section>
    </div>
    <p className="help-text">Observação: o teste confirma acesso e formato, não identifica sozinho a causa de erros internos. Para diagnósticos completos, o endpoint deve expor eventos com data, resultado e duração.</p>
  </>;
}
