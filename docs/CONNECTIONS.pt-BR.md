# Conexões configuráveis — Guia técnico

## Objetivo

O AI Diagnostics não tem dependências de integração específicas por fornecedor. Uma conexão é um registro configurável que aponta para um serviço previamente cadastrado. A mesma implementação processa APIs Node.js, Spring Boot, Python e outros sistemas capazes de responder a uma requisição HTTP GET.

As conexões oferecem dois modos diferentes:

- `JSON_LOGS`: consulta um endpoint JSON que retorna uma lista de eventos; extrai um array configurável, mapeia propriedades para o contrato de eventos e grava apenas campos normalizados no banco de dados.
- `HTTP_CHECK`: efetua uma requisição GET, mede o tempo de resposta e registra o status HTTP. Quando não há resposta, grava uma falha de conexão. Não interpreta o conteúdo nem descobre a causa interna da falha.

Os dois modos são executados **manualmente** nesta versão. Não há scheduler, tentativas automáticas nem execução de métodos que alterem dados no endpoint monitorado. Um endpoint GET indevidamente implementado com efeitos colaterais continua sendo responsabilidade do sistema consultado; use apenas rotas aprovadas para leitura.

## Organização dos arquivos

- `backend/src/connectors/schema.ts`: contrato Zod para o cadastro de conexões e mapeamentos.
- `backend/src/connectors/security.ts`: criptografia AES-256-GCM de credenciais e validações preventivas de URLs/hosts.
- `backend/src/connectors/mapper.ts`: leitura de propriedades por caminho simples e normalização de eventos; sem execução de JavaScript recebido da origem.
- `backend/src/connectors/service.ts`: CRUD, chamadas HTTP GET, testes, paginação, ingestão, bloqueio de concorrência e histórico.
- `backend/src/app.ts`: endpoints REST autenticados por chave local.
- `frontend/src/pages/Connections.tsx`: tela para cadastrar, editar, testar e sincronizar conexões.
- `frontend/src/lib/api.ts`: contratos dos endpoints e cliente do frontend.
- `database/04_connectors.sql`: criação das tabelas e índices do módulo. É uma migração aditiva.

## Banco de dados

`connectors` armazena a configuração técnica de cada conexão, referenciando `services.id` pela FK `service_id`. Os dados incluem URL, modo, autenticação, caminho do array, mapeamento JSON, paginação, último sucesso e habilitação.

`connector_sync_runs` registra o resultado de cada sincronização, referenciando `connectors.id`. Armazena quantidade de registros recebidos, inseridos, duplicados e descartados, horário e código de erro. Os registros importados ficam em `diagnostic_events`, reutilizando a infraestrutura existente.

Os dados de origem não são armazenados em formato bruto. A ingestão conserva apenas os campos definidos no contrato normalizado. IDs de eventos são SHA-256 do identificador do conector e do ID externo; na falta do ID externo, utiliza-se uma impressão digital do registro. Isso evita a duplicação de eventos durante reimportações, desde que o conteúdo ou ID de origem permaneça estável.

## Endpoints

Todos exigem `x-ingest-key` igual à chave definida em `backend/.env`. A chave não é salva pelo frontend em localStorage.

| Método | Endpoint | Função |
|---|---|---|
| GET | `/api/connectors` | Listar conexões sem revelar segredos |
| POST | `/api/connectors` | Cadastrar conexão |
| PUT | `/api/connectors/:id` | Editar conexão |
| DELETE | `/api/connectors/:id` | Excluir conexão sem histórico |
| POST | `/api/connectors/:id/test` | Validar acesso/formato sem salvar eventos |
| POST | `/api/connectors/:id/sync` | Sincronizar e normalizar registros |
| GET | `/api/connectors/:id/runs` | Consultar até 20 sincronizações recentes |

## Configuração local e migração

O banco `ai_diagnostics` existente **deve ser preservado**. Os scripts de inicialização do Docker só executam automaticamente quando o volume do PostgreSQL é criado pela primeira vez. Para atualizar um banco já existente, abra o PowerShell na raiz do projeto e execute:

```powershell
Get-Content .\database\04_connectors.sql -Raw | docker exec -i ai-diagnostics-db psql -v ON_ERROR_STOP=1 -U diagnostics -d ai_diagnostics
```

A migração não remove as tabelas ou os eventos anteriores. A SQL é idempotente, porém não deve ser interpretada como sistema completo de migrações versionadas.

No `backend/.env`, adicione:

```env
CONNECTOR_ALLOW_PRIVATE_HOSTS=true
CONNECTOR_ENCRYPTION_KEY=COLE_A_CHAVE_BASE64_GERADA_NO_SEU_COMPUTADOR
```

Gerar chave com o Node.js:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

Para ambientes não locais ou públicos, `CONNECTOR_ALLOW_PRIVATE_HOSTS=false`. Não altere a chave de criptografia após cadastrar credenciais: sem a chave original, os segredos cifrados não poderão ser recuperados.

No frontend, abra **Conexões**, informe a `INGEST_API_KEY` já existente no backend, selecione um projeto/serviço e preencha os dados do endpoint. Teste antes de sincronizar. Para criar novos projetos/serviços, use **Importar eventos**. O catálogo é atualizado após o cadastro.

## Exemplo de mapeamento JSON

Se a API externa responder:

```json
{
  "data": {
    "logs": [
      {"id": 891, "timestamp": "2026-11-04T12:00:00Z", "status": 429,
       "success": false, "elapsed": 385, "error": {"code": "RATE_LIMIT"}}
    ]
  }
}
```

Use `records_path=data.logs` e mapeie `event_uid=id`, `observed_at=timestamp`, `http_status=status`, `success=success`, `duration_ms=elapsed`, `error_code=error.code`. O campo `message` pode ficar vazio, evitando trazer texto livre ou informações desnecessárias.

A origem precisa fornecer data, duração e sucesso ou status HTTP. Ausências não serão substituídas por métricas inventadas: os registros inválidos são ignorados e contabilizados. Endpoints sem logs estruturados podem usar o modo `HTTP_CHECK` para monitoramento básico.

## Limitações operacionais e proteção

- Requisições remotas apenas GET, sem seguir redirecionamentos.
- Timeout de 8 segundos por requisição e resposta JSON limitada a 1 MB.
- Até cinco páginas por sincronização, até 200 registros por página, duas sincronizações por processo e uma por conexão, por meio de advisory lock do PostgreSQL.
- Testes não persistem eventos; sincronizações são iniciadas manualmente.
- Criptografia AES-256-GCM para segredos armazenados no PostgreSQL; valores não retornam nas listagens.
- URLs não podem conter credenciais embutidas; hosts internos são bloqueados por padrão, com opção explícita apenas para desenvolvimento local.
- A validação DNS preventiva não substitui segmentação de rede ou proteção completa contra SSRF (por exemplo, rebinding ou DNS/rota alterados). **Não disponibilize esta versão como um serviço público multiusuário.**
- Para produção, ainda são necessários autenticação por usuário, permissões por projeto, segredos em cofre, bloqueios de saída por firewall/proxy, TLS, controles de auditoria e política de retenção.
- O diagnóstico por LLM utiliza dados agregados do banco de eventos e não executa código recebido de origens monitoradas.

## Primeiro teste de conexão

Cadastre um projeto e serviço em **Importar eventos**. Na tela **Conexões**, utilize o modo `HTTP_CHECK` para consultar `http://127.0.0.1:3333/api/health`, com `CONNECTOR_ALLOW_PRIVATE_HOSTS=true` configurado no backend local. **Testar** realiza apenas a leitura; **Sincronizar** registra uma observação que pode ser acompanhada pelo dashboard. A confirmação do HTTP 200 atesta somente a resposta dessa rota, e não a saúde integral do sistema.
