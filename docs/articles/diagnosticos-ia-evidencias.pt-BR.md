# AI Diagnostics: engenharia de diagnósticos de APIs com LLMs e evidências verificáveis

**Autor:** Felipe Jahn Macedo  
**Projeto:** [AI Diagnostics — GitHub](https://github.com/fjahnm/ai-diagnostics)  
**Área:** Engenharia de Software aplicada à IA · Observabilidade · Sistemas distribuídos  
**Stack:** TypeScript, Node.js, Express, React, PostgreSQL, Docker, Vitest e Groq  
**Versão do estudo de caso:** implementação 1.1.x, revisada em novembro de 2026

## Resumo

Falhas em APIs e tarefas assíncronas podem envolver limites de requisição, erros de servidores, latência e eventos sem resposta HTTP. Um modelo de linguagem é capaz de explicar sinais operacionais em linguagem natural, mas não deve ser tratado como fonte de verdade para métricas ou causas-raiz. Este artigo apresenta o **AI Diagnostics**, uma aplicação que separa coleta, cálculos determinísticos, detecção de evidências e interpretação assistida por LLM. Eventos normalizados são armazenados no PostgreSQL; consultas SQL produzem indicadores; regras explícitas identificam padrões; e um provedor opcional de IA formula hipóteses referenciando evidências geradas pelo backend. A resposta é validada quanto ao contrato JSON, aos IDs citados e às afirmações numéricas permitidas. Uma demonstração reprodutível com **150 eventos inteiramente sintéticos**, distribuídos em quatro serviços, permite testar comportamentos esperados sem expor dados de clientes. Os resultados mostram a execução local de **31 testes unitários e quatro testes de integração**, além da validação determinística dos quatro cenários. A arquitetura reduz determinadas classes de erro e torna a interpretação auditável, mas **não garante que a hipótese gerada pelo LLM corresponda à causa real de um incidente**.

**Palavras-chave:** observabilidade; engenharia de software; IA generativa; LLM; validação de saída; PostgreSQL; evidência; diagnóstico de incidentes.

## 1. Problema e motivação

Um sistema pode registrar milhares de eventos, mas a existência de registros não significa que o diagnóstico seja evidente. Considere uma API que começa a devolver **HTTP 429** e **HTTP 503** no mesmo período. Os códigos permitem afirmar que houve limitação de requisições e falhas de servidor, respectivamente; eles **não** demonstram, isoladamente, que um fornecedor externo, o banco de dados ou uma mudança de infraestrutura seja a causa-raiz.

Delegar toda a análise a um LLM criaria dois problemas: o modelo poderia inventar números não presentes nos registros ou transformar correlações em afirmações causais. O AI Diagnostics foi construído para preservar uma fronteira explícita entre **o que o sistema mediu** e **o que o modelo sugere investigar**.

A pergunta central do projeto é: **como incorporar um LLM a um fluxo de investigação operacional sem transferir ao modelo a responsabilidade pela medição e verificação dos fatos?**

## 2. Objetivos e requisitos de engenharia

A implementação foi organizada em torno de cinco objetivos:

1. **Ingerir eventos de forma controlada e idempotente**, com um esquema conhecido e rejeição de duplicatas por serviço.
2. **Produzir indicadores verificáveis** no banco, sem solicitar cálculos ao LLM.
3. **Representar observações como evidências identificadas**, que possam ser inspecionadas independentemente da IA.
4. **Gerar hipóteses estruturadas e limitadas pelas evidências**, registrando falhas quando a saída não é confiável.
5. **Permitir demonstração e testes repetíveis**, sem dependência de dados reais, contas corporativas ou respostas fixas de um modelo.

O projeto adota uma arquitetura *local-first*. O dashboard pode exibir as evidências sem chave de IA; a geração de texto é uma funcionalidade adicional, não uma dependência para enxergar os indicadores.

## 3. Arquitetura da solução

```text
Fontes autorizadas / eventos enviados por API
                    │
           Validação e normalização
                    │
            PostgreSQL (eventos)
                    │
         Consultas SQL de métricas
                    │
       Regras determinísticas (EV-*)
                 ┌──┴───────────────────┐
                 │                      │
        Dashboard / evidências    Contexto agregado
                                        │
                                  LLM opcional
                                        │
                             Validação do diagnóstico
                                        │
                            Histórico + snapshots
```

Os componentes são:

| Camada | Responsabilidade | Implementação |
|---|---|---|
| Interface | Visualizar serviços, métricas, evidências e histórico | React e TypeScript |
| API | Expor endpoints, validar dados e padronizar erros | Express, Helmet e Zod |
| Ingestão e conectores | Receber lotes ou consultar fontes HTTP autorizadas | Serviços de ingestão e conectores GET |
| Persistência | Guardar projetos, serviços, eventos, análises e sincronizações | PostgreSQL |
| Motor determinístico | Calcular indicadores e produzir evidências identificáveis | SQL e funções TypeScript |
| Camada de IA | Construir contexto, chamar provedor e validar respostas | Groq, Gemini ou Ollama, de forma configurável |

O banco utiliza seis tabelas principais: `projects`, `services`, `diagnostic_events`, `ai_analyses`, `connectors` e `connector_sync_runs`. Uma restrição por `(service_id, event_uid)` evita a inserção repetida do mesmo evento para um serviço. As análises armazenam o resultado, o provedor, o modelo, o status e snapshots das métricas e evidências usados naquela execução.

**Referências no código:** [arquitetura](../ARCHITECTURE.pt-BR.md), [ingestão](../../backend/src/services/ingest.service.ts) e [serviço de diagnóstico](../../backend/src/services/diagnostics.service.ts).

## 4. Coleta, modelagem e indicadores

O contrato de ingestão aceita atributos como identificador único do evento, data com fuso horário, nível, sucesso, código HTTP opcional, duração, código de erro e mensagem opcional. O backend valida limites e consistência entre `success` e `http_status` antes da gravação. A operação de lote emprega uma transação SQL e `ON CONFLICT (service_id, event_uid) DO NOTHING`, retornando quantidades recebidas, inseridas e duplicadas.

As consultas de métricas utilizam filtros por serviço, projeto e janela temporal. O backend obtém:

- Total de execuções, sucessos e falhas;
- Taxa de sucesso e duração média, quando há observações;
- Distribuição de falhas por código HTTP;
- Contagens diárias para a linha do tempo;
- Comparação das últimas 24 horas com as 24 horas anteriores.

A taxa de falhas, quando calculada para interpretação, corresponde a `falhas / total × 100`. Se não houver eventos, a aplicação evita afirmar uma taxa observada. A distribuição reserva o código `0` para falhas sem status HTTP registrado; esse marcador **não é um código HTTP real**, e tampouco comprova automaticamente um timeout.

Uma decisão essencial é que **o LLM não calcula esses números**. Ele recebe um subconjunto estruturado dos indicadores e as evidências resultantes, enquanto o dashboard consulta os valores produzidos pelo backend.

**Referências no código:** [contratos de validação](../../backend/src/core/validation.ts) e [consultas de métricas](../../backend/src/services/metrics.service.ts).

## 5. Evidências determinísticas e severidade

O motor de detecção transforma métricas em observações com IDs estáveis. Esses IDs servem de conexão entre o que o backend observou e o que o LLM poderá mencionar.

| Evidência | Condição implementada | Interpretação correta |
|---|---|---|
| `EV-BASE` | Existe ao menos um evento no período | Linha de base de execuções e falhas |
| `EV-429` | Há falhas com HTTP 429 | Respostas de limitação de requisições observadas |
| `EV-5XX` | Há falhas com status de 500 a 599 | Erros de servidor observados |
| `EV-TIMEOUT` | Há falhas sem status HTTP registrado | Falhas sem resposta HTTP identificada; causa ainda exige investigação |
| `EV-LATENCY` | Duração média maior ou igual a 1.200 ms | Latência média acima de um limiar **ilustrativo** |
| `EV-TREND` | Pelo menos cinco eventos em cada janela de 24h e aumento de pelo menos 15 pontos percentuais na taxa de falhas | Piora observável entre duas janelas |

O limiar de **1.200 ms** é uma regra ilustrativa da demonstração; não deve ser interpretado como SLO universal. Similarmente, comparar janelas só tem valor dentro das condições de volume e período implementadas.

A **gravidade final** é definida pelo backend, não pelo modelo: taxa de falhas de pelo menos 25% resulta em `alta`; de pelo menos 10%, em `media`; e latência média de pelo menos 1.200 ms também pode resultar em `media`, quando nenhuma condição mais severa prevalecer. Na ausência desses sinais, a gravidade é `baixa`. São regras de produto demonstrativas, não uma avaliação estatística do impacto de negócio.

**Referência no código:** [detecção de anomalias](../../backend/src/services/anomalies.service.ts).

## 6. Integração com LLM e validação da resposta

A integração emprega um contrato comum que pode utilizar **Groq**, **Gemini** ou **Ollama**. Na demonstração realizada, o provedor foi o Groq, com o modelo `openai/gpt-oss-20b`. A presença de um adaptador para outros provedores não implica que todos tenham sido avaliados com os mesmos testes de qualidade de diagnóstico.

O prompt envia ao modelo o **tipo de serviço, o período, métricas agregadas, comparação temporal e evidências**. Ele não inclui nomes de clientes, projetos ou serviços, URLs de conexão, tokens nem payloads brutos dos eventos. Essa é uma medida de minimização, não uma garantia absoluta de anonimato.

O resultado esperado é um JSON com a seguinte estrutura conceitual:

```json
{
  "resumo": "Descrição baseada nas evidências disponíveis.",
  "gravidade": "media",
  "hipoteses": [
    {
      "descricao": "Possível explicação, ainda sujeita a investigação.",
      "confianca": "baixa",
      "evidencias": ["EV-429"],
      "recomendacao": "Verificar limites e padrões de requisição."
    }
  ],
  "limitacoes": ["A evidência não identifica, por si só, a causa-raiz."]
}
```

*O JSON acima é apenas um exemplo de formato; não representa uma resposta extraída dos resultados do experimento.*

A validação é aplicada em camadas:

1. **Contrato estrutural:** campos obrigatórios, tipos, enumerações e limites são verificados com Zod. No Groq, também se solicita resposta estruturada por `json_schema` com `strict: true`.
2. **Rastreabilidade:** cada hipótese deve citar pelo menos um ID que exista no conjunto de evidências do serviço.
3. **Afirmações numéricas:** números mencionados no texto livre são confrontados com tokens numéricos presentes nas métricas e descrições confiáveis, incluindo unidades; uma contagem não autoriza o mesmo número apresentado como percentual.
4. **Correção limitada:** se a única falha for uma alegação numérica não sustentada, a aplicação solicita uma reformulação uma vez. Erros de esquema ou de referência a evidências não são simplesmente aceitos.
5. **Gravidade controlada:** mesmo quando a resposta é validada, a gravidade informada pelo modelo é substituída pela avaliação determinística do backend.
6. **Falha explícita:** se o modelo não estiver configurado, ficar indisponível ou produzir saída inválida, o sistema registra um estado de falha; não fabrica uma resposta de sucesso.

No adaptador Groq, respostas JSON truncadas especificamente por limite de conclusão podem receber **uma única tentativa adicional** com orçamento maior, respeitando o teto de tokens configurado na implementação. Esse mecanismo não transforma uma resposta incompleta em evidência e pode elevar o consumo de tokens.

Essas salvaguardas **reduzem** certas alucinações verificáveis, mas não realizam verificação semântica completa. Uma hipótese pode citar evidências verdadeiras e ainda estar causalmente errada. O campo `confianca` é qualitativo (`baixa`, `media`, `alta`), não uma probabilidade calibrada.

**Referências no código:** [prompt](../../backend/src/ai/prompt.ts), [esquema JSON](../../backend/src/ai/schema.ts), [validação](../../backend/src/ai/validate.ts), [reformulação controlada](../../backend/src/ai/generate-validated.ts) e [provedores](../../backend/src/ai/provider.ts).

## 7. Metodologia de avaliação reprodutível

Para avaliar o comportamento observável da aplicação sem usar telemetria corporativa, foram implementados quatro cenários **inteiramente sintéticos**. O gerador constrói eventos de duas janelas temporais, ajustadas em relação ao momento da execução. Um projeto reservado, `ai-diagnostics-showcase`, isola os dados da demonstração.

O gerador substitui eventos e análises **somente dos serviços previstos nesse projeto reservado**, após verificar conflitos de nomes, serviços inesperados e conexões associadas. Ele recusa execução com `NODE_ENV=production` ou banco fora dos endereços locais reconhecidos. Isso protege o ambiente de demonstração, mas não substitui uma estratégia geral de backup.

Os cenários são:

| Serviço | Eventos | Falhas | Evidências esperadas |
|---|---:|---:|---|
| Checkout API | 48 | 20 | `EV-BASE`, `EV-429`, `EV-5XX`, `EV-TREND` |
| Catalog API | 40 | 0 | `EV-BASE` |
| Search API | 32 | 0 | `EV-BASE`, `EV-LATENCY` |
| Background Jobs | 30 | 9 | `EV-BASE`, `EV-TIMEOUT`, `EV-LATENCY`, `EV-TREND` |
| **Total** | **150** | **29** | Quatro cenários distintos |

A inclusão do **Catalog API sem falhas** é proposital: o sistema não deve inventar incidentes apenas para gerar um diagnóstico interessante. O cenário de jobs demonstra que ausência de status HTTP exige cuidado na interpretação, enquanto Search API mostra que latência pode ser relevante mesmo sem falha registrada.

O comando `npm run demo:evaluate` recalcula os dados no PostgreSQL e compara, para cada cenário, **total de eventos, total de falhas e sequência dos IDs de evidência** com os valores esperados. Qualquer divergência interrompe a avaliação com erro. Por padrão, não são enviadas requisições a um LLM.

O modo opcional `npm run demo:evaluate -- --llm` utiliza um provedor real e verifica o contrato e as referências de evidências. A avaliação não depende de respostas textuais fixas, e **não mede a precisão causal** sem um conjunto de referência anotado por especialistas.

**Referências no código:** [cenários sintéticos](../../backend/src/demo/scenarios.ts), [geração de dados](../../backend/src/demo/seed.ts), [avaliação](../../backend/src/demo/evaluate.ts) e [plano de avaliação](../EVALUATION.pt-BR.md).

## 8. Resultados observados e interpretação

Na validação local documentada durante o desenvolvimento, foram obtidos:

| Verificação | Resultado observado | O que comprova — e o que não comprova |
|---|---|---|
| Testes unitários | **31 de 31 aprovados** | As regras e contratos cobertos pelos testes tiveram o comportamento esperado |
| Testes de integração | **4 de 4 aprovados** | Endpoints, chave de ingestão, idempotência, persistência e registro de falha de IA funcionaram no PostgreSQL local |
| Build do backend | **Concluído** | O TypeScript compilou no ambiente testado |
| Avaliação determinística da demo | **4 de 4 cenários aprovados** | Totais, falhas e IDs de evidência coincidiram com as expectativas sintéticas |
| Avaliação com Groq | **Quatro análises reais validadas em execução local anterior** | As respostas dessa execução passaram pelo contrato; não é um estudo estatístico de acurácia |
| `npm audit` do backend e frontend | **0 vulnerabilidades reportadas nas verificações locais** | É um resultado pontual do auditor de dependências, não uma declaração de ausência de riscos |

Os testes de integração cobrem explicitamente o endpoint de saúde com banco, a proteção de endpoints administrativos por chave, a ingestão idempotente com métricas e evidências, e o registro de falha quando a IA não está configurada. A automação de CI possui etapas correspondentes; seu status deve ser verificado na execução mais recente do GitHub Actions, e não inferido apenas do sucesso local.

A conclusão suportada pelos testes é **reprodutibilidade de cenários controlados e verificação de contratos**. Não há base para alegar redução percentual de incidentes, melhoria de MTTR, desempenho comparativo frente a analistas humanos ou acurácia de identificação de causa-raiz.

## 9. Segurança, privacidade e limitações

O AI Diagnostics emprega validação de entrada, SQL parametrizado, limite de payload, consultas GET configuráveis, limitação de operações, criptografia de segredos de conectores em repouso e minimização do contexto enviado ao LLM. Esses controles respondem a riscos concretos, mas a aplicação **não deve ser anunciada como SaaS pronto para produção**.

As principais limitações são:

- **Autenticação e isolamento:** uma chave de ingestão não substitui login individual, RBAC, segregação por organização e revisão de autorização de leitura.
- **SSRF e acesso de rede:** validações de URL/IP não bastam, por si só, para impedir *DNS rebinding*; produção requer restrições efetivas de saída e allowlists.
- **Privacidade:** remoção de padrões conhecidos em textos não equivale a anonimização completa; telemetria real requer políticas de minimização, consentimento ou base legal apropriada e retenção definida.
- **Concorrência e filas:** o controle atual de análises simultâneas é local ao processo; não é um agendador distribuído durável.
- **Confiabilidade do diagnóstico:** evidências verdadeiras podem sustentar hipóteses erradas; severidade técnica não representa automaticamente impacto de negócio.
- **Avaliação de IA:** ainda faltam um conjunto de referência revisado por especialistas, testes adversários sistemáticos e métricas de custo, latência e qualidade por versão de modelo.

Nenhum dado empresarial ou credencial de produção é necessário para reproduzir os resultados sintéticos.

**Referência complementar:** [documentação de segurança](../SECURITY.pt-BR.md).

## 10. Como reproduzir o experimento

**Pré-requisitos:** Node.js compatível, npm, Docker Compose e um banco PostgreSQL local. Execute a partir da raiz do repositório:

```bash
# Banco local — NÃO use 'docker compose down -v' em uma instalação existente.
docker compose up -d

# Em outro terminal
cd backend
# Na primeira instalação, crie backend/.env a partir de .env.example
# e configure DATABASE_URL e INGEST_API_KEY para o ambiente local.
npm ci
npm run db:setup
npm run demo:seed
npm run demo:evaluate
npm test
npm run test:integration
npm run build

# Opcional: requer credenciais de provedor e faz chamadas externas.
npm run demo:evaluate -- --llm
```

Para visualizar a interface, em outro terminal execute `cd frontend`, instale as dependências com `npm ci` e use `npm run dev`. A documentação da [demonstração](../DEMO.pt-BR.md) contém o roteiro completo. Preserve um `.env` já configurado: não o substitua pelo arquivo de exemplo.

## 11. Evolução técnica prevista

Um próximo ciclo de pesquisa aplicada poderia: (a) comparar respostas de modelos sobre o mesmo conjunto de evidências com avaliação humana; (b) medir taxa de rejeição por validação, latência e custo por análise; (c) criar testes de robustez contra instruções maliciosas em dados; (d) incorporar limiares definidos por SLO, e não por valores ilustrativos; (e) testar detecção de anomalias com modelos clássicos de Machine Learning, mantendo o cálculo de métricas e a avaliação separados da narrativa do LLM.

Esse último passo seria um **projeto complementar de ML**, não algo que a versão descrita já execute: o AI Diagnostics atual integra modelos de linguagem, mas não treina um detector próprio.

## 12. Conclusão

O principal resultado do AI Diagnostics é uma separação arquitetural verificável: **o banco mede, as regras evidenciam, o LLM interpreta e o backend valida**. A combinação de contratos explícitos, referências por ID, validação numérica, registros históricos e cenários sintéticos permite construir uma experiência de investigação mais auditável do que uma simples chamada a um chatbot.

Essa abordagem não elimina alucinações nem automatiza a descoberta definitiva de causas-raiz. Seu mérito é delimitar responsabilidades, tornar resultados testáveis e declarar o que permanece incerto — fundamentos relevantes para engenharia de software aplicada à IA.

---

## Referências técnicas e material de reprodução

1. **Código-fonte e README:** [AI Diagnostics](https://github.com/fjahnm/ai-diagnostics).
2. **Arquitetura documentada:** [ARCHITECTURE.pt-BR.md](../ARCHITECTURE.pt-BR.md).
3. **Fluxo e salvaguardas de IA:** [AI_PIPELINE.pt-BR.md](../AI_PIPELINE.pt-BR.md).
4. **Plano de avaliação:** [EVALUATION.pt-BR.md](../EVALUATION.pt-BR.md).
5. **Segurança e riscos conhecidos:** [SECURITY.pt-BR.md](../SECURITY.pt-BR.md).
6. **Código de evidências:** [anomalies.service.ts](../../backend/src/services/anomalies.service.ts).
7. **Código de validação do LLM:** [validate.ts](../../backend/src/ai/validate.ts).
8. **Cenários de demonstração:** [scenarios.ts](../../backend/src/demo/scenarios.ts).

*Artigo técnico de engenharia e estudo de caso reproduzível. Os resultados apresentados se referem às execuções e à versão descritas; não constituem estudo científico de eficácia clínica, financeira ou operacional.*
