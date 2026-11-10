# Notas de verificação da entrega

Esta relação distingue verificações executadas no ambiente de geração de testes que ainda precisam ser executados pelo desenvolvedor.

## Executados

- Parser TypeScript do compilador global: 30 arquivos TS/TSX analisados sem erros sintáticos.
- Execução isolada do motor determinístico de evidências: cenário com HTTP 429/500 resultou nos IDs esperados `EV-BASE`, `EV-429`, `EV-5XX` e `EV-TREND` e gravidade alta.
- Arquivos JSON (`package.json`, exemplos e configurações estruturadas) analisados por parser JSON.
- Verificação textual de ausência de tokens, URLs empresariais e identificadores privados do sistema de origem.

## Ainda não executados neste ambiente

- `npm install` nos pacotes backend/frontend: registro público npm inacessível via DNS.
- `npm test`, TypeScript typecheck completo e builds Vite/Node: dependem da instalação das bibliotecas npm.
- Execução real do PostgreSQL e testes REST/SQL: Docker/PostgreSQL não estão instalados no ambiente de geração. A CI está preparada para executá-los.
- Chamada real ao LLM: não há chave pessoal do desenvolvedor nem modelo Ollama disponível.
- Testes de ponta a ponta em navegador: dependem dos passos anteriores.

O projeto inclui a automação `.github/workflows/ci.yml` para compilar e executar testes unitários após o código ser publicado em um repositório com acesso ao npm. A CI também inicia PostgreSQL em Docker para executar o teste de integração REST/SQL. Ainda é necessário um teste manual separado com LLM verdadeiro.

## Checklist de aceitação local

1. `docker compose up -d` e `docker compose ps` mostram o banco saudável.
2. `docker compose exec postgres psql -U diagnostics -d ai_diagnostics -c 'select count(*) from diagnostic_events;'` retorna 0 eventos antes da primeira importação.
3. `backend/.env` configurado; `npm install && npm test && npm run test:integration && npm run build` executa sem erros.
4. `frontend`: `npm install && npm run build` executa sem erros.
5. `/api/health` devolve `ok=true` e o dashboard apresenta dados.
6. O diagnóstico é executado com chave/modelo gratuitos válidos e persiste em `ai_analyses`.
7. Uma segunda análise de outro serviço utiliza a mesma API sem alterações de código.
8. O endpoint `/api/events/batch` aceita um evento de teste, ignora reenvio do mesmo `event_uid` e rejeita chave incorreta.
9. O mesmo diagnóstico pode ser reaberto na aba Histórico.


## Extensão: Conexões genéricas

- Código novo validado sintaticamente por transpilation TypeScript/TSX com TypeScript global.
- Os testes `connectors.test.ts` foram adicionados, mas não executados nesta geração.
- Não foi possível instalar dependências npm: `EAI_AGAIN` ao acessar o registro npm.
- Não houve execução com o PostgreSQL, o navegador ou APIs externas neste ambiente.
- A nova migração `database/04_connectors.sql` deve ser aplicada manualmente em volumes Docker já existentes.
- Homologar cadastro, teste GET, sincronização, tratamento de autenticação e verificação de segredos antes de usar dados autorizados de terceiros.
