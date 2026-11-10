# Arquitetura

## Objetivo

Coletar telemetria de serviços heterogêneos e entregar diagnósticos baseados em evidências verificáveis. A separação entre observação e interpretação é intencional: o backend determina números e padrões; o modelo de linguagem sugere possibilidades.

## Componentes

1. **Frontend React:** cadastro de projetos/serviços, conexões HTTP, dashboard, evidências e histórico.
2. **API Express:** endpoints REST, validação Zod, autenticação simples por chave nas rotas de escrita e tratamento consistente de erros.
3. **Conectores:** chamadas somente GET, autenticação Bearer ou chave em cabeçalho, paginação e normalização parametrizada. O modo `HTTP_CHECK` mede disponibilidade; `JSON_LOGS` importa eventos.
4. **PostgreSQL:** projetos, serviços, eventos, análises, conexões e histórico de sincronizações.
5. **Motor determinístico:** SQL produz taxas, tempos, erros e janelas temporais; regras geram evidências com IDs estáveis.
6. **LLM opcional:** adaptadores para Groq, Gemini ou Ollama; validação do JSON devolvido, das evidências citadas e das afirmações numéricas em texto livre.

## Fluxo de dados

```text
Fonte autorizada ── GET ou POST /events/batch ──> Validação
                                                   │
                                            Eventos normalizados
                                                   │
                                               PostgreSQL
                                                   │
                                     Métricas SQL + evidências
                                            │            │
                                        Dashboard    LLM opcional
                                                       │
                                               Validação e histórico
```

## Estrutura

- `backend/src/connectors/`: esquema, transporte, segurança e mapeamento.
- `backend/src/services/`: catálogo, ingestão, métricas, anomalias e diagnósticos.
- `backend/src/ai/`: prompt, provedores e validação.
- `backend/src/demo/`: cenários sintéticos, geração e avaliação.
- `frontend/src/pages/`: interface e filtros.
- `frontend/src/components/`: componentes visuais e evidências.

## Banco

A versão utiliza as seis tabelas já existentes: `projects`, `services`, `diagnostic_events`, `ai_analyses`, `connectors` e `connector_sync_runs`. Não depende de alterações estruturais adicionais. Índices em serviço/data suportam buscas temporais; pares `(service_id, event_uid)` evitam duplicação por serviço.

## Decisões e limites

- Os campos das APIs externas não ficam codificados no backend; são configurados pela interface.
- As regras de evidência não usam o modelo e podem ser testadas de forma determinística.
- Evidência indica anomalia observada; não comprova a origem do problema.
- Uma chamada GET ainda pode consumir recursos de um servidor remoto. Consulte somente sistemas autorizados.
- A API atual foi concebida para operação local; não oferece RBAC multiusuário nem monitoramento distribuído sempre ativo.
