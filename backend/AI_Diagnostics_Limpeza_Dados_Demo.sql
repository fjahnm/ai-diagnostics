-- API Hub AI Diagnostics - limpeza dos dados iniciais de demonstracao
-- Execute somente apos realizar backup. Nao altera a estrutura do banco.
-- Mantem projetos, servicos, eventos e conexoes criados posteriormente.

BEGIN;

DO $cleanup$
DECLARE
  unexpected_services BIGINT;
  unexpected_events BIGINT;
  active_connectors BIGINT;
  project_count BIGINT;
BEGIN
  SELECT COUNT(*) INTO project_count
  FROM projects
  WHERE slug IN ('api-platform-demo', 'expense-reporting-demo');

  SELECT COUNT(*) INTO unexpected_services
  FROM services s
  JOIN projects p ON p.id = s.project_id
  WHERE p.slug IN ('api-platform-demo', 'expense-reporting-demo')
    AND NOT (
      (p.slug = 'api-platform-demo' AND s.code IN ('payment-connector', 'customer-sync'))
      OR (p.slug = 'expense-reporting-demo' AND s.code IN ('expense-api', 'approval-worker'))
    );

  SELECT COUNT(*) INTO unexpected_events
  FROM diagnostic_events e
  JOIN services s ON s.id = e.service_id
  JOIN projects p ON p.id = s.project_id
  WHERE p.slug IN ('api-platform-demo', 'expense-reporting-demo')
    AND e.event_uid NOT LIKE 'demo-%';

  SELECT COUNT(*) INTO active_connectors
  FROM connectors c
  JOIN services s ON s.id = c.service_id
  JOIN projects p ON p.id = s.project_id
  WHERE p.slug IN ('api-platform-demo', 'expense-reporting-demo');

  IF unexpected_services > 0 OR unexpected_events > 0 OR active_connectors > 0 THEN
    RAISE EXCEPTION
      'Limpeza cancelada: % servicos adicionais, % eventos nao demonstrativos, % conexoes nos projetos demo. Revise antes de excluir.',
      unexpected_services, unexpected_events, active_connectors;
  END IF;

  IF project_count = 0 THEN
    RAISE NOTICE 'Nenhum projeto demonstrativo original encontrado. Nenhuma alteracao necessaria.';
    RETURN;
  END IF;

  RAISE NOTICE 'Limpando somente os projetos originais de demonstracao (%).', project_count;

  DELETE FROM ai_analyses a
  USING services s, projects p
  WHERE a.service_id = s.id
    AND s.project_id = p.id
    AND p.slug IN ('api-platform-demo', 'expense-reporting-demo');

  DELETE FROM diagnostic_events e
  USING services s, projects p
  WHERE e.service_id = s.id
    AND s.project_id = p.id
    AND p.slug IN ('api-platform-demo', 'expense-reporting-demo')
    AND e.event_uid LIKE 'demo-%';

  DELETE FROM services s
  USING projects p
  WHERE s.project_id = p.id
    AND p.slug IN ('api-platform-demo', 'expense-reporting-demo');

  DELETE FROM projects
  WHERE slug IN ('api-platform-demo', 'expense-reporting-demo');

  RAISE NOTICE 'Limpeza concluida. Banco e tabelas preservados.';
END;
$cleanup$;

COMMIT;
