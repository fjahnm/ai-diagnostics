import { useState, type ChangeEvent } from 'react';
import { FileJson, LockKeyhole, UploadCloud } from 'lucide-react';
import { api } from '../lib/api';

export function ImportEvents({onCatalogChanged}: {onCatalogChanged:()=>Promise<void>}){
  const [input,setInput]=useState<unknown>(null);
  const [name,setName]=useState('');
  const [key,setKey]=useState('');
  const [busy,setBusy]=useState(false);
  const [projectName,setProjectName]=useState('');
  const [projectSlug,setProjectSlug]=useState('');
  const [serviceName,setServiceName]=useState('');
  const [serviceCode,setServiceCode]=useState('');
  const [serviceProject,setServiceProject]=useState('');
  const [serviceType,setServiceType]=useState('REST_API');
  const [result,setResult]=useState('');
  const [error,setError]=useState('');
  async function choose(e:ChangeEvent<HTMLInputElement>){
    setError('');setResult('');setInput(null);
    const file=e.target.files?.[0];if(!file)return;
    if(file.size>500000){setError('Arquivo muito grande. Máximo: 500 KB.');return}
    try{setInput(JSON.parse(await file.text()));setName(file.name)}catch{setError('Arquivo JSON inválido.')}
  }
  async function importData(){
    setBusy(true);setError('');setResult('');
    try{const r=await api.ingest(input,key);setResult(`${r.inserted} evento(s) incluído(s). ${r.duplicates} duplicado(s) ignorado(s).`);setKey('')}
    catch(e){setError(e instanceof Error?e.message:'Erro ao importar.')}finally{setBusy(false)}
  }
  async function registerProject(){
    setBusy(true);setError('');setResult('');
    try{const r=await api.createProject({name:projectName,slug:projectSlug},key);setResult(`Projeto ${r.name} cadastrado.`);await onCatalogChanged();setProjectName('');setProjectSlug('')}
    catch(e){setError(e instanceof Error?e.message:'Erro ao cadastrar projeto.')}finally{setBusy(false)}
  }
  async function registerService(){
    setBusy(true);setError('');setResult('');
    try{const r=await api.createService({project_slug:serviceProject,code:serviceCode,name:serviceName,type:serviceType},key);setResult(`Serviço ${r.name} cadastrado.`);await onCatalogChanged();setServiceName('');setServiceCode('')}
    catch(e){setError(e instanceof Error?e.message:'Erro ao cadastrar serviço.')}finally{setBusy(false)}
  }
  return <><div className="page-header"><div><div className="eyebrow"><UploadCloud size={13}/> INGESTÃO SEGURA</div><h1>Importar eventos JSON</h1><p>Um único contrato de eventos para projetos desenvolvidos em qualquer linguagem.</p></div></div>
  <div className="import-grid"><section className="panel import-panel"><div className="panel-heading"><div><h3>Importação em lote</h3><p>Máximo de 200 eventos por envio; registros duplicados são ignorados.</p></div></div>
    <label className="file-drop"><FileJson size={26}/><strong>{name||'Selecionar arquivo JSON'}</strong><span>Selecione um arquivo contendo registros do serviço cadastrado</span><input type="file" accept=".json,application/json" onChange={choose}/></label>
    <label className="field-label" htmlFor="ingest-key"><LockKeyhole size={15}/> Chave de ingestão local</label>
    <input id="ingest-key" autoComplete="off" type="password" value={key} onChange={e=>setKey(e.target.value)} placeholder="Valor de INGEST_API_KEY"/>
    <p className="help-text">A chave fica apenas na memória desta página. Não é armazenada no navegador.</p>
    <button className="primary-button" disabled={!input||!key||busy} onClick={importData}><UploadCloud size={17}/>{busy?'Importando...':'Enviar eventos'}</button>
    {result&&<div className="success-box" role="status">{result}</div>}{error&&<div className="error-box" role="alert">{error}</div>}
  </section><aside className="panel instructions"><h3>Formato de envio</h3><p>O objeto JSON informa o projeto e o serviço. Cada evento contém identificador único, data, status e duração.</p><pre>{`{\n  "project_slug": "minha-aplicacao",\n  "service_code": "minha-api",\n  "events": [\n    {\n      "event_uid": "registro-01",\n      "observed_at": "2026-11-04T12:00:00Z",\n      "level": "ERROR",\n      "success": false,\n      "http_status": 429,\n      "duration_ms": 300\n    }\n  ]\n}`}</pre><p>Importe somente dados cuja utilização seja autorizada. Remova credenciais e informações pessoais antes do envio.</p></aside></div>
  <div className="registration-grid">
    <section className="panel"><h3>Cadastrar projeto</h3><p className="help-text">Registre uma aplicação independente antes de enviar os eventos.</p>
      <label className="field-label" htmlFor="new-project-name">Nome do projeto</label>
      <input id="new-project-name" className="text-field" value={projectName} onChange={e=>setProjectName(e.target.value)} placeholder="Minha Aplicação"/>
      <label className="field-label" htmlFor="new-project-slug">Identificador técnico</label>
      <input id="new-project-slug" className="text-field" value={projectSlug} onChange={e=>setProjectSlug(e.target.value)} placeholder="minha-aplicacao"/>
      <button className="secondary-button" disabled={!key||!projectName||!projectSlug||busy} onClick={registerProject}>Criar projeto</button>
    </section>
    <section className="panel"><h3>Cadastrar serviço</h3><p className="help-text">O projeto deve existir antes de cadastrar um serviço.</p>
      <label className="field-label" htmlFor="service-project">Slug do projeto</label>
      <input id="service-project" className="text-field" value={serviceProject} onChange={e=>setServiceProject(e.target.value)} placeholder="minha-aplicacao"/>
      <label className="field-label" htmlFor="service-name">Nome do serviço</label>
      <input id="service-name" className="text-field" value={serviceName} onChange={e=>setServiceName(e.target.value)} placeholder="API Principal"/>
      <label className="field-label" htmlFor="service-code">Código do serviço</label>
      <input id="service-code" className="text-field" value={serviceCode} onChange={e=>setServiceCode(e.target.value)} placeholder="api-principal"/>
      <label className="field-label" htmlFor="service-type">Tipo</label>
      <select id="service-type" className="text-field" value={serviceType} onChange={e=>setServiceType(e.target.value)}><option value="REST_API">API REST</option><option value="INTEGRATION">Integração</option><option value="BACKGROUND_JOB">Job agendado</option></select>
      <button className="secondary-button" disabled={!key||!serviceProject||!serviceName||!serviceCode||busy} onClick={registerService}>Criar serviço</button>
    </section>
  </div>
  </>;
}
