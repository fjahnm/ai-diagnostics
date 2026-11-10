import { Activity, CheckCircle2, XCircle, Gauge, Clock3 } from 'lucide-react';
import type { Metrics } from '../lib/api';
import { formatNumber } from '../lib/api';

export function SummaryCards({data}:{data:Metrics}) {
  const cards = [
    {label:'Total de execuções',value:formatNumber(data.total), icon:Activity,tone:'neutral'},
    {label:'Bem-sucedidas',value:formatNumber(data.succeeded),icon:CheckCircle2,tone:'green'},
    {label:'Falhas',value:formatNumber(data.failed),icon:XCircle,tone:'red'},
    {label:'Taxa de sucesso',value:data.success_rate == null ? '—' : `${data.success_rate.toFixed(1)}%`,icon:Gauge,tone:'blue'},
    {label:'Tempo médio',value:data.avg_duration_ms == null ? '—' : `${data.avg_duration_ms} ms`,icon:Clock3,tone:'neutral'}
  ];
  return <div className="stats-grid">{cards.map(({label,value,icon:Icon,tone})=><div key={label} className="stat-card">
    <div className="stat-top"><span>{label}</span><Icon size={18} className={`tone-${tone}`}/></div>
    <div className="stat-value">{value}</div>
    <div className="stat-meta">Últimos {data.days} dias</div>
  </div>)}</div>;
}
