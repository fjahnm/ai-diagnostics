-- Optional read-only checks after creating the schema.
SELECT p.slug, s.code, COUNT(e.id) AS events,
       COUNT(e.id) FILTER (WHERE e.success = FALSE) AS failures
FROM projects p JOIN services s ON s.project_id=p.id
LEFT JOIN diagnostic_events e ON e.service_id=s.id
GROUP BY p.slug,s.code ORDER BY p.slug,s.code;

SELECT tablename,indexname,indexdef
FROM pg_indexes
WHERE schemaname='public' AND tablename IN
  ('projects','services','diagnostic_events','ai_analyses')
ORDER BY tablename,indexname;
