-- Execute em um banco ai_diagnostics vazio usando psql -f, ou aplique cada arquivo na ordem abaixo.
-- 01_schema.sql: projetos, servicos, eventos e analises.
-- 04_connectors.sql: conexoes genericas e historico de sincronizacoes.
-- Este arquivo nao insere registros; utilize os dois arquivos para configurar o schema.
\ir 01_schema.sql
\ir 04_connectors.sql
