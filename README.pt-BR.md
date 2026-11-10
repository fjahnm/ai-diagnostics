# AI Diagnostics

**Português** · [English](README.md)

**Observabilidade e investigação de incidentes orientadas por evidências para APIs e tarefas em segundo plano.**

O AI Diagnostics coleta eventos operacionais, calcula métricas verificáveis e identifica padrões por regras determinísticas. Opcionalmente, um modelo de linguagem transforma as evidências em **hipóteses**, recomendações e limitações. O modelo não calcula os indicadores originais.

## Funcionalidades

- Aplicação completa com React, Node.js, TypeScript, Express, PostgreSQL e Docker.
- Conexões HTTP GET configuráveis e mapeamento de campos JSON.
- Ingestão idempotente e métricas calculadas pelo PostgreSQL.
- Evidências de incidentes disponíveis **mesmo sem chave de IA**.
- Diagnóstico opcional por Groq, Gemini ou Ollama, com validação das referências citadas.
- Testes automatizados e quatro cenários reproduzíveis de monitoramento.

## Demonstração em poucos minutos (após instalar)

```powershell
cd backend
npm run demo:seed
npm run demo:evaluate
```

Acesse `http://127.0.0.1:5173`, selecione **AI Diagnostics — Demonstração** e o período **Últimos 14 dias**. Abra cada serviço e confira a seção **Evidências observadas**. As evidências são geradas pelo backend, sem chamar um modelo. Com um provedor de IA configurado, clique em **Analisar com IA**; essa análise é real e não utiliza uma resposta predefinida.

| Serviço | Execuções | Falhas | Evidência esperada |
|---|---:|---:|---|
| Checkout API | 48 | 20 | Limite de requisições, erros de servidor, aumento de falhas |
| Catalog API | 40 | 0 | Operação saudável, sem inventar anomalias |
| Search API | 32 | 0 | Latência média elevada |
| Background Jobs | 30 | 9 | Falhas sem status HTTP, latência e tendência |

O comando recria **apenas** eventos e análises do projeto reservado `ai-diagnostics-showcase`, atualizando suas datas. Ele não apaga projetos existentes, conexões configuradas nem volumes do Docker. Também bloqueia execução contra bancos não locais e com `NODE_ENV=production`.

## Instalação local

Requisitos: Node.js 20+, npm e Docker Compose. Chave Groq/Gemini ou Ollama são opcionais para demonstrar as evidências.

```powershell
# Terminal 1 — raiz do repositório
docker compose up -d

# Terminal 2
cd backend
Copy-Item .env.example .env
# Configure DATABASE_URL, INGEST_API_KEY e, opcionalmente, os provedores de IA.
npm install
npm run db:setup
npm run demo:seed
npm run demo:evaluate
npm run dev

# Terminal 3
cd frontend
npm install
npm run dev
```

A preparação do banco utiliza `CREATE TABLE IF NOT EXISTS`. **Se o banco já existir, preserve o `backend/.env` e o volume atual**. Esta versão não exige nenhuma migração nova.

Testes: no backend, `npm test`, `npm run test:integration` e `npm run build`; no frontend, `npm run build`. A integração depende do PostgreSQL local ativo.

### Avaliação opcional com um LLM

```powershell
cd backend
npm run demo:evaluate -- --llm
```

A opção `--llm` executa análises reais e valida formato e referências das evidências. Não representa uma medição de acurácia dos modelos, nem uma confirmação automática da causa raiz. Observe limites e custos de uso do provedor.

## Arquitetura resumida

```text
Conexões HTTP GET / Ingestão manual
                |
     Validação e normalização
                |
        Eventos PostgreSQL
                |
   Métricas e evidências determinísticas
                |
     Painel (independente do LLM)
                |
 Diagnóstico opcional e validação da IA
                |
    Histórico com métricas e evidências
```

## Limitações e segurança

Este repositório é voltado à execução local e **não é uma plataforma multiusuário pronta para produção**. Ainda necessita de autenticação por usuário, autorização por projeto, isolamento efetivo de rede para conectores, política de retenção, uma fila durável para análises e revisão de privacidade. As mensagens importadas não podem ser consideradas anonimizadas automaticamente. A origem dos dados precisa ser autorizada e minimizada.

O prompt de IA inclui métricas técnicas agregadas, tipo do serviço e evidências produzidas no backend; não inclui payloads originais nem os nomes de serviços e projetos. Uma verificação HTTP indica disponibilidade observada, não a causa de um incidente.

## Documentação

| Tema | Português | English |
|---|---|---|
| Demonstração | [Passo a passo](docs/DEMO.pt-BR.md) | [Walkthrough](docs/DEMO.en.md) |
| Arquitetura | [Arquitetura](docs/ARCHITECTURE.pt-BR.md) | [Architecture](docs/ARCHITECTURE.en.md) |
| IA | [Pipeline de IA](docs/AI_PIPELINE.pt-BR.md) | [AI pipeline](docs/AI_PIPELINE.en.md) |
| Conexões | [Conexões](docs/CONNECTORS.pt-BR.md) | [Connectors](docs/CONNECTORS.en.md) |
| Segurança | [Segurança](docs/SECURITY.pt-BR.md) | [Security](docs/SECURITY.en.md) |
| Avaliação | [Avaliação](docs/EVALUATION.pt-BR.md) | [Evaluation](docs/EVALUATION.en.md) |

Referência detalhada: [Guia técnico em português](docs/TECHNICAL_GUIDE.pt-BR.md).

## Autoria

Projeto de portfólio em engenharia de software e IA aplicada. **Felipe Jahn Macedo** · [GitHub](https://github.com/fjahnm).
