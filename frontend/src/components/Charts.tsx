import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Bar, BarChart } from 'recharts';
import type { Metrics } from '../lib/api';

const tooltipStyle = {background:'#171e32',border:'1px solid #30394f',borderRadius:12,color:'#f5f7fa'};

export function Charts({data}:{data:Metrics}) {
  const timeline = data.timeline.map(day=>({...day,label:day.day.slice(5)}));
  const distribution = data.error_distribution.map(x=>({code:x.code ? `HTTP ${x.code}`:'Sem HTTP',count:x.count}));
  return <div className="charts-grid">
    <section className="panel chart-panel">
      <div className="panel-heading"><div><h3>Evolução das execuções</h3><p>Sucessos e falhas por dia</p></div>
        <div className="legend"><span className="legend-success">Sucesso</span><span className="legend-failure">Falha</span></div></div>
      {timeline.length ? <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><AreaChart data={timeline} margin={{top:8,right:6,left:-25,bottom:0}}>
        <defs><linearGradient id="successGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#57c6a3" stopOpacity={0.22}/><stop offset="100%" stopColor="#57c6a3" stopOpacity={0}/></linearGradient></defs>
        <CartesianGrid stroke="#2a3549" vertical={false} strokeDasharray="3 5"/><XAxis dataKey="label" tick={{fill:'#8190a9',fontSize:11}} tickLine={false} axisLine={false}/>
        <YAxis allowDecimals={false} tick={{fill:'#8190a9',fontSize:11}} tickLine={false} axisLine={false}/>
        <Tooltip contentStyle={tooltipStyle}/><Area dataKey="succeeded" name="Sucesso" type="monotone" stroke="#57c6a3" fill="url(#successGradient)" strokeWidth={2} dot={false}/>
        <Area dataKey="failed" name="Falha" type="monotone" stroke="#ff7989" fill="none" strokeWidth={2} dot={false}/>
      </AreaChart></ResponsiveContainer></div> : <div className="empty">Sem eventos neste período.</div>}
    </section>
    <section className="panel chart-panel"><div className="panel-heading"><div><h3>Distribuição de falhas</h3><p>Códigos observados nos registros</p></div></div>
      {distribution.length ? <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><BarChart data={distribution} margin={{top:12,right:12,left:-25,bottom:0}}>
        <CartesianGrid stroke="#2a3549" vertical={false} strokeDasharray="3 5"/>
        <XAxis dataKey="code" tick={{fill:'#8190a9',fontSize:11}} tickLine={false} axisLine={false}/>
        <YAxis allowDecimals={false} tick={{fill:'#8190a9',fontSize:11}} tickLine={false} axisLine={false}/>
        <Tooltip contentStyle={tooltipStyle}/><Bar dataKey="count" name="Falhas" fill="#8489f3" radius={[5,5,0,0]} maxBarSize={44}/>
      </BarChart></ResponsiveContainer></div> : <div className="empty">Nenhuma falha registrada.</div>}
    </section>
  </div>;
}
