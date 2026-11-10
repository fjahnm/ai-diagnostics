export interface Project { id: number; slug: string; name: string; description: string }
export interface Service { id: number; project_id: number; code: string; name: string; type: string; enabled: boolean; project_name: string; project_slug: string }
export interface Metrics {
  days: number; total: number; succeeded: number; failed: number;
  success_rate: number | null; avg_duration_ms: number | null;
  error_distribution: Array<{code:number;count:number}>;
  timeline: Array<{day:string;succeeded:number;failed:number}>;
  windows: {recent_total:number;recent_failed:number;previous_total:number;previous_failed:number}
}
export interface Event {
  id: number; event_uid: string; observed_at: string; level: string; success: boolean;
  http_status: number | null; duration_ms: number; error_code: string | null; message: string | null
}
export interface Evidence { id:string;type:string;description:string;values:Record<string,number|null> }
export interface EvidenceReport { service_id:number;period_days:number;severity:'baixa'|'media'|'alta';evidences:Evidence[];note:string }
export interface DiagnosticOutput {
  resumo: string;gravidade:'baixa'|'media'|'alta';
  hipoteses:Array<{descricao:string;confianca:'baixa'|'media'|'alta';evidencias:string[];recomendacao:string}>;
  limitacoes:string[]
}
export interface Analysis {
  id:number;service_id:number;service_name:string;project_name:string;provider:string;model:string;
  status:'pending'|'completed'|'failed';period_days:number;error_code:string|null;
  duration_ms:number|null;created_at:string;
  metrics_snapshot?:Metrics;evidences_snapshot?:Evidence[];result?:DiagnosticOutput|null;finished_at?:string|null
}
export interface ConnectorInput {
  service_id:number; name:string; endpoint_url:string; mode:'JSON_LOGS'|'HTTP_CHECK'; records_path:string;
  field_mapping: { event_uid:string; observed_at:string; success:string; http_status:string; duration_ms:string; error_code:string; message:string };
  auth_type:'NONE'|'BEARER'|'API_KEY'; auth_header:string|null; auth_secret?:string;
  pagination_mode:'NONE'|'PAGE'; page_parameter:string; page_start:number; max_pages:number;
  page_size_parameter:string|null;page_size:number;enabled:boolean;
}
export interface Connector extends Omit<ConnectorInput,'auth_secret'> {
  id:number; has_secret:boolean; last_success_at:string|null; project_name:string;
  project_slug:string;service_name:string;service_code:string;
}
export interface ProviderInfo { provider:string;model:string;configured:boolean }

export class ApiError extends Error { constructor(public code:string,message:string){super(message)} }

async function request<T>(path:string,options:RequestInit = {}): Promise<T> {
  let response:Response;
  try { response = await fetch('/api'+path,{...options,headers:{...(options.body ? {'content-type':'application/json'} : {}),...options.headers}}); }
  catch { throw new ApiError('NETWORK','Não foi possível conectar ao backend local.'); }
  const data = await response.json().catch(()=>null);
  if (!response.ok) throw new ApiError(data?.error?.code ?? 'HTTP_ERROR',data?.error?.message ?? `Erro HTTP ${response.status}`);
  return data as T;
}

export const api = {
  connectors: (key:string) => request<{items:Connector[]}>('/connectors',{headers:{'x-ingest-key':key}}),
  createConnector: (data:ConnectorInput,key:string) => request<Connector>('/connectors',{method:'POST',headers:{'x-ingest-key':key},body:JSON.stringify(data)}),
  updateConnector: (id:number,data:ConnectorInput,key:string) => request<Connector>(`/connectors/${id}`,{method:'PUT',headers:{'x-ingest-key':key},body:JSON.stringify(data)}),
  testConnector: (id:number,key:string) => request<{reachable:boolean;duration_ms:number;records_found?:number;valid_events?:number;http_status?:number|null;success?:boolean}>(`/connectors/${id}/test`,{method:'POST',headers:{'x-ingest-key':key}}),
  syncConnector: (id:number,key:string) => request<{status:string;received:number;inserted:number;duplicates:number;skipped:number}>(`/connectors/${id}/sync`,{method:'POST',headers:{'x-ingest-key':key}}),
  connectorRuns: (id:number,key:string) => request<{items:Array<{id:number;status:string;received:number;inserted:number;duplicates:number;skipped:number;started_at:string;error_code:string|null}>}>(`/connectors/${id}/runs`,{headers:{'x-ingest-key':key}}),
  projects: () => request<{items:Project[]}>('/projects'),
  services: (projectId?:number) => request<{items:Service[]}>(`/services${projectId ? `?project_id=${projectId}`:''}`),
  overview: (days:number,projectId?:number) => request<Metrics>(`/overview?days=${days}${projectId ? `&project_id=${projectId}`:''}`),
  metrics: (serviceId:number,days:number) => request<Metrics>(`/services/${serviceId}/metrics?days=${days}`),
  evidences: (serviceId:number,days:number) => request<EvidenceReport>(`/services/${serviceId}/evidences?days=${days}`),
  events: (serviceId:number,page=1) => request<{items:Event[];page:number;page_size:number}>(`/services/${serviceId}/events?page=${page}`),
  provider: () => request<ProviderInfo>('/ai/status'),
  analyses: (serviceId?:number) => request<{items:Analysis[]}>(`/analyses${serviceId ? `?service_id=${serviceId}`:''}`),
  analysis: (id:number) => request<Analysis>(`/analyses/${id}`),
  analyze: (serviceId:number,days:number) => request<Analysis>(`/services/${serviceId}/analyze`,{method:'POST',body:JSON.stringify({days})}),
  createProject: (payload:{slug:string;name:string;description?:string},key:string) => request<Project>('/projects',{
    method:'POST',headers:{'x-ingest-key':key},body:JSON.stringify(payload)
  }),
  createService: (payload:{project_slug:string;code:string;name:string;type:string},key:string) => request<Service>('/services',{
    method:'POST',headers:{'x-ingest-key':key},body:JSON.stringify(payload)
  }),
  ingest: (json:unknown,key:string) => request<{received:number;inserted:number;duplicates:number}>('/events/batch',{
    method:'POST',headers:{'x-ingest-key':key},body:JSON.stringify(json)
  })
};

export function formatDate(value:string){return new Date(value).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})}
export function formatNumber(value:number | null){return value == null ? '—' : new Intl.NumberFormat('pt-BR').format(value)}
