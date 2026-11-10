# Guia técnico — API Hub AI Diagnostics

**Versão:** 1.0.0 (MVP local)  
**Objetivo:** documentar estrutura, funcionamento, contratos, decisões de projeto, limitações, instalação, testes e caminhos de evolução.

> Esta documentação é específica da implementação independente de portfólio. O projeto não contém módulos proprietários, credenciais, dados de clientes, conexões Firebird ou infraestrutura de produção empresarial.

## 1. Visão geral

A solução centraliza registros normalizados de execuções de serviços. Um serviço pertence a um projeto. Cada evento informa se uma execução foi bem-sucedida, seu horário, duração e eventual código HTTP ou de erro. O backend consulta os eventos no PostgreSQL para produzir indicadores. O motor de anomalias usa regras determinísticas e converte os indicadores em evidências com identificadores estáveis. Um provedor externo ou local de LLM recebe somente essas informações agregadas e devolve um diagnóstico estruturado.

O usuário acompanha métricas no dashboard, seleciona um serviço, solicita uma análise e acessa o histórico dos resultados. As análises ficam vinculadas à versão exata das métricas e evidências utilizada na solicitação.

**Separação de responsabilidades:**

1. O PostgreSQL armazena os fatos observáveis, sem tratar logs como instruções.
2. A API calcula todos os valores numéricos; nenhum número calculado pelo LLM é utilizado.
3. As regras determinísticas produzem evidências auditáveis.
4. O LLM produz apenas hipóteses, recomendações e limitações. A gravidade final é derivada da proporção de falhas, e não escolhida pelo modelo.
5. Zod e o verificador de referências rejeitam respostas incompatíveis, referências inventadas e textos numéricos livres.
6. O histórico armazena sucesso e falha do diagnóstico para auditoria operacional.

## 2. Arquitetura

```text
React + Vite (127.0.0.1:5173)
  │ /api (proxy do Vite em desenvolvimento)
  ▼
Express + TypeScript (127.0.0.1:3333)
  ├── catálogo de projetos e serviços
  ├── métricas SQL e histórico de eventos
  ├── ingestão validada (x-ingest-key)
  ├── motor determinístico de anomalias
  ├── orquestração e validação de análises
  │      └── adaptador de IA (Groq | Gemini | Ollama)
  └── histórico persistido
             │
             ▼
PostgreSQL 16 (127.0.0.1:5434)
```

Sem mensageria, ORM, microsserviços ou agente autônomo. A simplicidade é intencional: menor superfície de erro, menor consumo de memória e menor custo de manutenção.

## 3. Requisitos e instalação

### 3.1. Requisitos

- Node.js 20 ou mais recente (recomendado 22 LTS).
- npm.
- Docker Desktop/Engine com Docker Compose, ou PostgreSQL 16 instalado manualmente.
- Porta TCP 5434 livre no host (banco), 3333 (API) e 5173 (interface).
- Uma chave ativa de Groq ou Gemini dentro do nível de uso disponível, ou Ollama instalado com um modelo local.

### 3.2. Inicialização completa

No diretório raiz:

```bash
docker compose up -d
docker compose ps
```

O Docker Compose inicializa apenas o PostgreSQL. Em uma instalação nova, aplique `database/01_schema.sql` e `database/04_connectors.sql` uma única vez. Em instalações existentes, não recrie o volume.

No terminal do backend:

```bash
cd backend
cp .env.example .env
# Configure as variáveis de ambiente
npm install
npm run dev
```

No PowerShell, a cópia é `Copy-Item .env.example .env`.

No terminal do frontend:

```bash
cd frontend
npm install
npm run dev
```

Acesse `http://127.0.0.1:5173` e confira `http://127.0.0.1:3333/api/health`.

### 3.3. Reiniciar ambiente com dados limpos

```bash
docker compose down -v
docker compose up -d
```

**Atenção:** `down -v` remove definitivamente o banco local armazenado no volume. Não execute essa operação sobre dados que precisam ser preservados.

### 3.4. PostgreSQL fora do Docker

Crie o banco e usuário desejados, ajuste `DATABASE_URL`, e execute:

```bash
# Alternativa: um só arquivo, schema + dados:
psql -d ai_diagnostics -f database/00_full_setup.sql

# Ou dois arquivos separados:
psql -d ai_diagnostics -f database/01_schema.sql
psql -d ai_diagnostics -f database/04_connectors.sql
psql -d ai_diagnostics -f database/03_inspect.sql
```

Em ambiente com usuário PostgreSQL diferente, informe `-U` e `-h` conforme necessário. Os scripts são compatíveis com PostgreSQL 16 e não dependem de um backup binário.

## 4. Configurações

O único arquivo que deve conter credenciais é `backend/.env`, ignorado pelo Git. `backend/.env.example` documenta os nomes esperados.

| Variável | Finalidade |
|---|---|
| `NODE_ENV` | Ambiente de execução |
| `HOST` | Interface de rede (padrão 127.0.0.1) |
| `PORT` | Porta Express (3333) |
| `DATABASE_URL` | URL de conexão PostgreSQL |
| `INGEST_API_KEY` | Segredo de pelo menos 24 caracteres para o endpoint de ingestão |
| `LLM_PROVIDER` | `groq`, `gemini` ou `ollama` |
| `LLM_TIMEOUT_MS` | Tempo máximo por tentativa de chamada ao modelo, em milissegundos |
| `GROQ_API_KEY` | Token Groq, somente no servidor |
| `GROQ_MODEL` | ID do modelo usado na Groq |
| `GEMINI_API_KEY` | Token Gemini, somente no servidor |
| `GEMINI_MODEL` | ID do modelo usado no Gemini |
| `OLLAMA_URL` | Serviço local Ollama, preferencialmente 127.0.0.1 |
| `OLLAMA_MODEL` | Nome do modelo baixado localmente |

**Exemplo Groq:** `LLM_PROVIDER=groq`, `GROQ_API_KEY=...`, `GROQ_MODEL=openai/gpt-oss-20b`.

**Exemplo Gemini:** `LLM_PROVIDER=gemini`, `GEMINI_API_KEY=...` e escolha um `GEMINI_MODEL` ao qual a chave tenha acesso gratuito. Disponibilidade e cotas variam.

**Exemplo Ollama:** `ollama pull llama3.2:3b` e `LLM_PROVIDER=ollama`. Requer RAM suficiente para executar o modelo; a opção local evita chamadas externas, mas consome mais memória e CPU.

A existência de uma modalidade gratuita não significa ausência de limites ou disponibilidade garantida. É necessário consultar o painel do provedor.

## 5. Banco de dados

### 5.1. Diagrama lógico

```text
projects (1) ── (N) services (1) ── (N) diagnostic_events
                           └────── (1) ── (N) ai_analyses
```

### 5.2. Tabela `projects`

- `id` — INTEGER IDENTITY, PK.
- `slug` — identificador público do projeto, único e validado por regex.
- `name` — nome de apresentação.
- `description` — descrição sintética opcional.
- `created_at` — data de cadastro.

### 5.3. Tabela `services`

- `id` — INTEGER IDENTITY, PK.
- `project_id` — INTEGER, FK para `projects(id)`; ON DELETE RESTRICT.
- `code` — identificador técnico único dentro de um projeto.
- `name` — nome de exibição.
- `type` — `REST_API`, `INTEGRATION` ou `BACKGROUND_JOB`.
- `enabled` — ativo/inativo, padrão verdadeiro.
- `created_at` — data de cadastro.
- Unique `project_id + code` impede duplicidade dentro de um projeto.

### 5.4. Tabela `diagnostic_events`

- `id` — INTEGER IDENTITY, PK.
- `service_id` — FK para `services(id)`; ON DELETE RESTRICT.
- `event_uid` — identificador idempotente de evento, fornecido pelo emissor ou gerado no banco.
- `observed_at` — instante UTC com fuso (`timestamptz`), usado nos agregados.
- `level` — `INFO`, `WARN`, `ERROR`.
- `success` — booleano de sucesso da execução.
- `http_status` — código 100 a 599, ou NULL para execução sem resposta HTTP.
- `duration_ms` — duração entre zero e 600.000 ms.
- `error_code` — classe sintética resumida de erro.
- `message` — mensagem sintética limitada a 280 caracteres; não é enviada ao modelo.
- `created_at` — instante de recebimento.
- Unique `(service_id,event_uid)` permite reenvio seguro sem duplicatas.

### 5.5. Tabela `ai_analyses`

- `id` — INTEGER IDENTITY, PK.
- `service_id` — FK para `services(id)`; ON DELETE RESTRICT.
- `provider` e `model` — modelo efetivamente configurado na tentativa.
- `status` — `pending`, `completed`, `failed`.
- `period_days` — janela avaliada: 7, 14 ou 30 dias.
- `metrics_snapshot` — JSONB com métricas imutáveis da tentativa.
- `evidences_snapshot` — JSONB com evidências determinísticas apresentadas.
- `result` — JSONB da resposta do modelo validada, se concluída.
- `error_code` — código de erro padronizado, sem payload do provedor.
- `duration_ms` — duração da chamada e da validação.
- `created_at`, `finished_at` — auditoria temporal.

### 5.6. Índices e integridade

- Índice em `services(project_id)` para filtragem por projeto.
- Índice composto em `diagnostic_events(service_id,observed_at DESC)` para consultas e séries temporais.
- Índice parcial em `(service_id,observed_at DESC)` restrito a falhas para investigação.
- Índices em `ai_analyses(service_id,created_at DESC)` e `ai_analyses(created_at DESC)` para histórico.
- Constraints para slug, tipos de serviço, nível, duração e códigos HTTP.
- Integridade referencial via FKs. A política `RESTRICT` evita apagar registros associados sem tratamento explícito.

Não foram incluídos índices redundantes em colunas pouco utilizadas. Para volume elevado, avaliar `EXPLAIN (ANALYZE, BUFFERS)`, particionamento temporal e políticas de retenção.

### 5.7. Banco sem registros pré-carregados

A instalação inicial cria somente tabelas, índices e restrições. Os registros operacionais devem ser coletados por conexão autorizada ou enviados pela API de ingestão. Para remover registros antigos, utilize uma operação de limpeza específica após backup e revisão.

## 6. Contrato HTTP

A aplicação opera em `http://127.0.0.1:3333`. O frontend usa proxy `/api` do Vite e não mantém chaves de LLM.

| Método | URL | Resultado |
|---|---|---|
| GET | `/api/health` | Verifica acesso ao banco |
| GET | `/api/ai/status` | Provedor, modelo e flag de configuração; nunca mostra a chave |
| GET | `/api/projects` | Lista projetos |
| POST | `/api/projects` | Cadastra projeto (exige `x-ingest-key`) |
| POST | `/api/services` | Cadastra serviço (exige `x-ingest-key`) |
| GET | `/api/services?project_id=1` | Lista serviços, com filtro opcional |
| GET | `/api/overview?days=14&project_id=1` | Agregados globais ou por projeto |
| GET | `/api/services/1/metrics?days=14` | Métricas específicas de serviço |
| GET | `/api/services/1/events?page=1` | Eventos paginados, 30 por página |
| POST | `/api/services/1/analyze` | Executa análise real com body `{ "days": 14 }` |
| GET | `/api/analyses?service_id=1` | Últimas 100 análises; filtro opcional |
| GET | `/api/analyses/1` | Detalhes de uma análise |
| POST | `/api/events/batch` | Recebe eventos com `x-ingest-key` |

### 6.1. Cadastro de um projeto externo

Antes de importar eventos de outra aplicação, cadastre o projeto e seu serviço usando a aba **Importar eventos** ou os endpoints protegidos abaixo:

```bash
curl -X POST http://127.0.0.1:3333/api/projects \
  -H 'Content-Type: application/json' \
  -H 'x-ingest-key: SUBSTITUA_PELA_CHAVE_CONFIGURADA' \
  -d '{"slug":"minha-aplicacao","name":"Minha Aplicação"}'

curl -X POST http://127.0.0.1:3333/api/services \
  -H 'Content-Type: application/json' \
  -H 'x-ingest-key: SUBSTITUA_PELA_CHAVE_CONFIGURADA' \
  -d '{"project_slug":"minha-aplicacao","code":"servico-http","name":"Serviço HTTP","type":"REST_API"}'
```

Os identificadores são únicos por projeto. Depois, envie eventos com os mesmos `project_slug` e `service_code`. Isso permite integrar aplicações em outras linguagens sem adaptar o motor de diagnóstico.

### 6.2. Ingestão

Cabeçalhos: `Content-Type: application/json`, `x-ingest-key: <valor do backend/.env>`.

Exemplo:

```json
{
  "project_slug": "minha-aplicacao",
  "service_code": "minha-api",
  "events": [
    {
      "event_uid": "example-001",
      "observed_at": "2026-11-04T12:00:00Z",
      "level": "ERROR",
      "success": false,
      "http_status": 429,
      "duration_ms": 300,
      "error_code": "RATE_LIMIT",
      "message": "Falha reportada pelo serviço"
    }
  ]
}
```

Com Linux/macOS, após iniciar o backend e ajustar a chave:

```bash
curl -X POST http://127.0.0.1:3333/api/events/batch \
  -H 'Content-Type: application/json' \
  -H 'x-ingest-key: SUBSTITUA_PELA_CHAVE_CONFIGURADA' \
  --data-binary @samples/events-import.json
```

Execute esse exemplo estando na raiz do repositório. No Windows, use `curl.exe` ou importe o JSON pela interface, fornecendo a chave apenas para o envio. O frontend não salva a chave no localStorage.

**Resposta:** `received` indica enviados, `inserted` indica realmente inseridos e `duplicates` os registros com `event_uid` já existente. Lotes acima de 200 eventos ou payloads acima de 512 KB são rejeitados.

### 6.3. Análise de um serviço

```bash
curl -X POST http://127.0.0.1:3333/api/services/1/analyze \
  -H 'Content-Type: application/json' \
  -d '{"days":14}'
```

Retorna HTTP 201 e o registro persistido. Sem chave do provedor, o backend retorna erro explícito e registra a tentativa como `failed`. Não há fallback de diagnóstico simulado.

### 6.4. Respostas de erro

Formato: `{ "error": { "code": "...", "message": "..." } }`. Exemplos de códigos:

- `VALIDATION_ERROR` (400), `BODY_TOO_LARGE` (413), `UNAUTHORIZED` (401).
- `SERVICE_NOT_FOUND` (404), `PROJECT_NOT_FOUND` (404), `PROJECT_EXISTS` / `SERVICE_EXISTS` (409), `ANALYSIS_NOT_FOUND` (404), `NO_EVENTS` (422).
- `ANALYSIS_RUNNING` (409), `LOCAL_RATE_LIMIT` (429).
- `LLM_NOT_CONFIGURED` (503), `LLM_RATE_LIMIT` (503), `LLM_AUTH_ERROR` (503).
- `LLM_TIMEOUT` (504), `LLM_UNAVAILABLE` (503), `LLM_OUTPUT_INVALID` (502).
- `LLM_EVIDENCE_INVALID` (502), `LLM_NUMERIC_CLAIM` (502), `INTERNAL_ERROR` (500).

O backend não devolve mensagens internas de SQL ou payloads de erro confidenciais do provedor.

## 7. Algoritmo de métricas

`metrics.service.ts` executa quatro agregações SQL independentes, sem carregar todos os logs em memória:

1. Totais: `COUNT`, `COUNT FILTER`, `AVG` e taxa de sucesso com divisão protegida contra zero.
2. Códigos de erro HTTP com agrupamento e ordenação por frequência.
3. Série diária UTC para sucessos e falhas.
4. Contagens de sucesso/falha nas duas janelas de 24 horas mais recentes.

Os períodos selecionáveis são 7, 14 e 30 dias. A taxa de sucesso vem do banco, e `NULL` sinaliza que a janela não tem execuções. A média é arredondada em milissegundos. As tabelas no frontend trabalham com a resposta agregada.

## 8. Evidências determinísticas

`anomalies.service.ts` usa apenas fatos obtidos em SQL. Também calcula a gravidade final de forma determinística: baixa para menos de 10% de falhas, média de 10% a menos de 25%, alta a partir de 25% (limiares ilustrativos, não um SLA). O resultado tem formato `{ id, type, description, values }`.

| Código | Gatilho | Interpretação |
|---|---|---|
| EV-BASE | Existem eventos | Volume, falhas e sucesso observados |
| EV-429 | Existem respostas 429 | Indício de limitação de requisições |
| EV-5XX | Existem respostas 5xx | Falhas do lado de serviço/resposta |
| EV-TIMEOUT | Existem erros sem código HTTP | Causa a investigar; não prova timeout |
| EV-LATENCY | Média de duração ≥ 1200 ms | Limiar ilustrativo; não é SLA formal |
| EV-TREND | Aumento ≥ 15 pontos entre períodos de 24h, com pelo menos cinco eventos por janela | Tendência de piora |

É possível alterar regras e limiares sem tocar no provedor LLM. O modelo pode sugerir investigação, mas não altera valores, filtros, critérios ou IDs de evidência.

## 9. Integração com modelos de linguagem

### 9.1. Contrato entre o motor e os provedores

`provider.ts` expõe `getProviderInfo()` e `generateDiagnosis(userPrompt)`. O restante do sistema não conhece detalhes de URL ou autenticação de Groq, Gemini e Ollama.

Fluxo:

1. O usuário clica **Analisar com IA**.
2. O backend valida `serviceId` e janela, e consulta o catálogo.
3. `getServiceMetrics` busca indicadores consolidados.
4. `detectAnomalies` gera evidências identificadas.
5. É criada uma linha `pending` no banco, com snapshots.
6. `createPrompt` envia ao adaptador apenas projeto, serviço, indicadores agregados e evidências. Mensagens brutas dos eventos não vão ao modelo.
7. O adaptador faz a requisição real com timeout e repetição limitada para respostas 429/502/503/504.
8. `validateDiagnosis` valida o JSON com Zod, a origem das referências e impede dígitos em textos livres (métricas são mostradas em outros campos).
9. A gravidade retornada pelo modelo é substituída pelo nível calculado pelo backend. O status passa a `completed` com resultado, ou `failed` com código de erro sanitizado.

### 9.2. JSON de resposta do modelo

```json
{
  "resumo": "A integração apresenta erros recorrentes ao chamar a dependência externa.",
  "gravidade": "media",
  "hipoteses": [
    {
      "descricao": "O serviço pode estar sofrendo restrições de taxa.",
      "confianca": "media",
      "evidencias": ["EV-429"],
      "recomendacao": "Inspecionar políticas de limitação e cabeçalhos de resposta."
    }
  ],
  "limitacoes": [
    "Os logs não confirmam a configuração do provedor externo."
  ]
}
```

Os campos `resumo`, `gravidade`, `hipoteses`, `limitacoes` são obrigatórios. O campo `confianca` utiliza somente valores qualitativos. As evidências citadas precisam existir no snapshot enviado. Nenhum texto livre pode introduzir dígitos, justamente para não fabricar métricas ou números de casos. As métricas originais continuam disponíveis no objeto `metrics_snapshot` calculado fora do modelo.

### 9.3. Provedores

- **Groq:** `POST /openai/v1/chat/completions`, usando autenticação Bearer e resposta JSON Schema estrita no modelo configurado. O modelo padrão em `.env.example` é `openai/gpt-oss-20b`; trocar somente se o modelo de destino suportar o formato.
- **Gemini:** `POST /v1beta/models/{modelo}:generateContent` e `responseMimeType=application/json`, com validação de conteúdo no backend.
- **Ollama:** `POST /api/chat`, `stream=false`, `format` definido como JSON Schema e `keep_alive=30s` para poupar memória após uso.

Todos possuem timeout por tentativa, no máximo uma repetição para falhas transitórias previamente classificadas e limite de tamanho da resposta. Uma requisição não dispara uma chamada secundária para outro provedor automaticamente: isso evita uso de cotas inesperadas.

**Importante:** sem acesso do ambiente atual a credenciais gratuitas reais, o conteúdo do diagnóstico não pode ser garantido antecipadamente. O teste completo deve ser realizado com uma chave própria ou um modelo Ollama instalado.

## 10. Segurança

**Mecanismos presentes:**

- Banco, API e Vite limitados a loopback no ambiente de desenvolvimento.
- Tokens LLM exclusivos do backend; `.env` ignorado no Git.
- Chave de ingestão verificada em comparação com tempo constante.
- Body JSON limitado a 512 KB e até 200 eventos por lote.
- Validação estrita de campos, formatos, intervalos e coerência de status HTTP, com rejeição de propriedades inesperadas.
- Query SQL parametrizada; nenhuma tabela ou coluna derivada diretamente do payload.
- Redação simples de certos padrões de segredo presentes em mensagens curtas; não substitui classificação de dados.
- Somente agregados e evidências são enviados à IA; mensagem individual de log não é transmitida.
- Limite local de dez análises a cada dez minutos por origem e bloqueio de análises simultâneas para o mesmo serviço por processo.
- Sem exposição de mensagens detalhadas de exceções internas.

**Limitações deliberadas do MVP:** não há autenticação de usuários do dashboard, RBAC, TLS, CORS/configuração de gateway de produção, autenticação da rota de análise, limites distribuídos entre réplicas, retenção automatizada de eventos, proteção contra DDoS, isolamento por tenant autenticado nem garantia de conformidade regulatória. A ingestão exige chave, mas isso não torna o protótipo adequado para publicação na internet. Nunca expor diretamente as portas do protótipo.

**Para uma implantação futura:** autenticação real, autorização por projeto, HTTPS atrás de reverse proxy, gestão de segredos, storage encryption e backup, retenção e expurgo, rate limiting distribuído, filas com jobs idempotentes, observabilidade do próprio diagnóstico, políticas de dados e revisão de segurança. Para dados reais, solicitar autorização e rever o fluxo de privacidade do provedor.

## 11. Estrutura de pastas e arquivos

```text
api-hub-ai-diagnostics/
├── README.md                      apresentação pública e instruções resumidas
├── .gitignore                     exclusões de credenciais e artefatos
├── docker-compose.yml             banco local e inicialização SQL
├── .github/workflows/ci.yml       testes e compilação no GitHub Actions
├── database/
│   ├── 00_full_setup.sql          aplica os dois scripts de estrutura com psql
│   ├── 01_schema.sql              tabelas, PKs, FKs, CHECKs, UNIQUEs e índices
│   ├── 04_connectors.sql          conexões HTTP e histórico
│   └── 03_inspect.sql             consultas de verificação do banco
├── samples/
│   └── events-import.json         contrato de importação com dado fictício
├── backend/
│   ├── package.json               dependências e comandos Node
│   ├── tsconfig.json              compilação TypeScript backend
│   ├── .env.example               configurações documentadas
│   └── src/
│       ├── app.ts                 middlewares, rotas REST e erros HTTP
│       ├── server.ts              startup, bind e encerramento graceful
│       ├── config/
│       │   ├── env.ts             leitura e validação de variáveis
│       │   └── db.ts              pool PostgreSQL limitado
│       ├── core/
│       │   ├── errors.ts          erros tipados e códigos de falha
│       │   └── validation.ts      esquemas de entrada/saída com Zod
│       ├── ai/
│       │   ├── prompt.ts          instruções do modelo e contexto agregado
│       │   ├── schema.ts          JSON Schema comum dos provedores
│       │   ├── provider.ts        adaptadores Groq/Gemini/Ollama e transport
│       │   └── validate.ts        contrato de saída e evidências válidas
│       ├── services/
│       │   ├── catalog.service.ts catálogo de projetos e serviços
│       │   ├── ingest.service.ts  gravação transacional, deduplicação e redação
│       │   ├── metrics.service.ts agregações SQL, série temporal e paginação
│       │   ├── anomalies.service.ts regras determinísticas de anomalias
│       │   └── diagnostics.service.ts ciclo de vida e auditoria da análise
│       └── tests/
│           ├── anomalies.test.ts  testes de evidência
│           ├── validation.test.ts testes do contrato de ingestão
│           ├── diagnostics.test.ts testes de saída do modelo
│           ├── provider.test.ts    transporte HTTP de provedor simulado em teste
│           └── api.integration.ts testes reais da API contra PostgreSQL
├── frontend/
│   ├── index.html                 HTML inicial e metadados
│   ├── package.json               dependências React/Vite
│   ├── tsconfig.json              compilação TypeScript frontend
│   ├── vite.config.ts             servidor de desenvolvimento e proxy da API
│   └── src/
│       ├── main.tsx               montagem do React
│       ├── App.tsx                navegação, shell e carregamento do catálogo
│       ├── styles.css             layout, responsividade e visual
│       ├── lib/api.ts             tipos TS e cliente HTTP
│       ├── components/
│       │   ├── Charts.tsx         gráficos de execução/erros
│       │   ├── SummaryCards.tsx   KPIs agregados
│       │   └── Diagnosis.tsx      painel de hipóteses, evidências e limitações
│       └── pages/
│           ├── Dashboard.tsx      indicadores, filtros e serviços
│           ├── ServiceDetails.tsx detalhes, eventos e execução da IA
│           ├── History.tsx        auditoria e consulta do resultado salvo
│           └── ImportEvents.tsx   importação JSON com chave em memória
└── docs/
    ├── TECHNICAL_GUIDE.pt-BR.md   este documento
    └── VALIDATION_NOTES.md        relatórios dos testes executados e pendentes
```

Todos os módulos do backend usam importações explícitas, tipagem estática e retornos JSON. O CSS não exige geração adicional nem bibliotecas de UI grandes.

## 12. Custos, memória e processamento

- Um banco PostgreSQL Alpine com memória limitada a 512 MB no Docker Compose.
- Pool PostgreSQL configurado com máximo de cinco conexões, timeout curto de conexão, idle de 10 segundos e limite por consulta de oito segundos.
- Consultas com agregação no banco, em vez de transportar arrays inteiros de logs para Node.
- Frontend carrega somente 30 eventos recentes por solicitação.
- Histórico da interface recebe no máximo 100 análises, sem o JSONB completo até o usuário abrir o item.
- Ingestão limitada a 200 eventos por lote; transações evitam inserção parcial em caso de erro.
- Prompt compacto contendo agregados, distribuições e regras determinísticas; logs brutos nunca entram no contexto da IA.
- Um único provedor ativo por vez e `maxOutputTokens/max_completion_tokens` moderado.

O controle de custos em ambientes públicos exigirá métricas de uso de tokens e limites por usuário/projeto; não estão no MVP. Modelos locais podem demandar consideravelmente mais recursos que o próprio backend.

## 13. Testes

No diretório `backend`:

```bash
npm test
# Exige banco de dados ativo e configurado no .env
npm run test:integration
npm run typecheck
npm run build
```

No diretório `frontend`:

```bash
npm run typecheck
npm run build
```

Testes unitários cobrem geração de evidências, gravidade, aceitação/rejeição de JSON de ingestão, validação de referências da resposta do LLM e transporte de um adaptador Groq com requisições HTTP interceptadas em teste. Os testes unitários não chamam a API externa. O teste de integração usa PostgreSQL real para verificar cadastro, ingestão idempotente, métricas e persistência de falha de IA não configurada. Não há chamada falsa disfarçada de LLM no fluxo real.

**Teste manual recomendado:** iniciar o PostgreSQL e aplicar o schema, conferir `/api/health`, cadastrar um projeto e serviço, criar uma conexão, executar **Testar** e **Sincronizar**, verificar registros importados, realizar **Analisar com IA** com um provedor válido, verificar as evidências e abrir a análise na aba Histórico.

**Teste de provedor:** uma chamada real depende da chave, das cotas e de conectividade externa (ou serviço Ollama). Sem isso, o registro deverá terminar em `failed`, nunca em diagnóstico fabricado.

## 14. Operação e solução de problemas

**Banco indisponível:** verificar `docker compose ps`, porta 5434, `DATABASE_URL`, volume existente e logs `docker compose logs postgres`. A API health faz `SELECT 1`.

**Tabelas ausentes:** volumes já existentes não repetem scripts de `/docker-entrypoint-initdb.d`; executar SQL manualmente ou apagar o volume local com cautela.

**Frontend sem dados:** conferir proxy Vite, porta 3333, conexão com banco e resultado de `/api/projects`.

**401 ao importar:** chave diferente de `INGEST_API_KEY`; caracteres espaços adicionais e chaves curtas não são aceitos pelo backend.

**429 de análise:** limite de análises locais; aguardar a janela ou não repetir cliques. 429 do provedor é tratado em código distinto (`LLM_RATE_LIMIT`).

**LLM_NOT_CONFIGURED:** preencher a chave Groq/Gemini ou escolher Ollama.

**LLM_TIMEOUT:** modelo indisponível/lento, rede restrita ou timeout pequeno. Para Ollama, conferir modelo instalado e memória disponível.

**LLM_OUTPUT_INVALID / LLM_NUMERIC_CLAIM:** o provedor gerou JSON incompatível ou texto numérico não validado. Verificar aderência do modelo ao schema, sem liberar a validação de evidências como workaround.

**LLM_EVIDENCE_INVALID:** a resposta citou um identificador que não estava nas evidências fornecidas; a análise é rejeitada e a tentativa auditada.

**Eventos não aparecem:** conferir se `observed_at` caiu dentro da janela de 7, 14 ou 30 dias. Confira as datas dos registros fornecidos pelo sistema integrado.

**Mudança de modelo:** editar `LLM_PROVIDER` e a variável do modelo, reiniciar o backend. Não gravar tokens no frontend.

## 15. Evoluções futuras prioritárias

1. Autenticação e autorização por projeto/ambiente, inclusive para leitura.
2. Persistência de jobs e processamento assíncrono com filas para diagnósticos demorados.
3. Ingestão OpenTelemetry / OTLP e coletores para múltiplas linguagens.
4. Retenção programada de eventos e particionamento de tabelas volumosas.
5. Avaliação automatizada de qualidade de hipóteses com casos rotulados.
6. Telemetria de custos/tokens por provedor; limites de orçamento e alertas.
7. Exportação de diagnósticos e notificações.
8. Instrumentação do próprio backend, backup, controle de migrações por versão, deploy seguro e revisão de segurança.

## 16. Referências técnicas públicas

- API Groq e Structured Outputs: https://console.groq.com/docs/api-reference e https://console.groq.com/docs/structured-outputs
- API Gemini e cobrança: https://ai.google.dev/gemini-api/docs e https://ai.google.dev/gemini-api/docs/pricing
- API Ollama: https://docs.ollama.com/api
- PostgreSQL: https://www.postgresql.org/docs/16/
- Zod: https://zod.dev/
- Express: https://expressjs.com/
- React: https://react.dev/

Não há credenciais de produção, código de terceiros não autorizado ou referências a infraestrutura empresarial nesta implementação.

## 17. Status de verificação da entrega

Consulte [`VALIDATION_NOTES.md`](VALIDATION_NOTES.md) para a lista de verificações efetivamente executadas e o checklist de homologação local. A compilação completa e uma chamada de IA real dependem de dependências npm e credenciais que não estão disponíveis no ambiente de geração.


## 18. Conectores configuráveis (evolução do MVP)

A camada de conexões genéricas foi adicionada após a entrega inicial. Ela desacopla a origem dos dados do motor de métricas e do módulo LLM. Consulte [`CONNECTIONS.pt-BR.md`](CONNECTIONS.pt-BR.md) para a especificação completa, as tabelas, os contratos REST e o procedimento de migração sem perda de dados.

O sistema recebe logs normalizados de qualquer stack por envio de eventos ou por consultas GET JSON, além de registrar verificações HTTP. O uso de endpoints externos depende de autorização explícita e configuração na interface; não há conectores de fornecedores fixos no código.

## Atualização: módulo de Conexões

A interface `frontend/src/pages/Connections.tsx` cadastra e testa conexões somente leitura. O backend armazena configurações em `connectors`, consulta endpoints HTTP GET com limites de tempo e tamanho e insere somente eventos normalizados em `diagnostic_events`. O componente `frontend/src/pages/ImportEvents.tsx` mantém o cadastro de projetos/serviços, compartilhado com a tela de conexões. O catálogo no menu é atualizado após o cadastro. O banco inicia vazio em instalações novas.
