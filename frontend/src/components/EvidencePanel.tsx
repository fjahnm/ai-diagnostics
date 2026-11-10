import { ClipboardCheck, ShieldAlert } from 'lucide-react';
import type { EvidenceReport } from '../lib/api';

export function EvidencePanel({ report }: { report: EvidenceReport | null }) {
  if (!report) return null;
  const hasIncidents = report.evidences.some(item => item.id !== 'EV-BASE');
  return <section className="panel evidence-panel" aria-label="Evidências calculadas">
    <div className="panel-heading">
      <div><div className="eyebrow"><ClipboardCheck size={14}/> DETECÇÃO DETERMINÍSTICA</div>
        <h3>Evidências observadas</h3>
        <p>Calculadas a partir dos eventos do banco, sem chamar um modelo de IA.</p>
      </div>
      <span className={`severity severity-${report.severity}`}>Gravidade {report.severity}</span>
    </div>
    {!report.evidences.length ? <p className="subtle">Nenhuma execução foi registrada neste período.</p> : <>
      <div className="evidence-list">
        {report.evidences.map(item => <div className="evidence-row" key={item.id}>
          <code>{item.id}</code><span>{item.description}</span>
        </div>)}
      </div>
      <p className="evidence-disclaimer"><ShieldAlert size={15}/>
        {hasIncidents ? 'Os padrões indicam pontos de investigação, mas não provam a causa raiz.' : 'Nenhum padrão de falha foi identificado pelas regras atuais. Isso não garante ausência de problemas.'}
      </p>
    </>}
  </section>;
}
