# Pipeline de IA e decisões técnicas

## O que o modelo recebe

O backend envia ao LLM um objeto estruturado contendo **tipo do serviço, janela de análise, quantidade de execuções, sucessos, falhas, taxa de sucesso, duração média, distribuição de HTTP, comparação das últimas janelas e evidências calculadas**. Não envia payloads, mensagens originais, URLs de conexão, tokens ou nomes de clientes, projetos ou serviços. O código responsável é `backend/src/ai/prompt.ts`.

## Etapas

1. O PostgreSQL calcula os indicadores, sem participação do modelo.
2. `detectAnomalies` cria evidências identificáveis como `EV-429`, `EV-5XX`, `EV-TIMEOUT`, `EV-LATENCY` e `EV-TREND`.
3. O adaptador chama o provedor configurado. Em Groq, solicita resposta JSON estruturada; outros provedores usam contratos equivalentes.
4. O backend valida a estrutura, limita os campos e verifica que **todas as referências das hipóteses existem**.
5. A gravidade final é determinada pelo backend, com regras explícitas de falha/latência. A interpretação textual permanece uma hipótese.
6. O resultado e um snapshot das métricas são armazenados em `ai_analyses`.

## Prevenção de alucinações

O prompt instrui o modelo a distinguir fatos de hipóteses, não inventar medidas e citar IDs reais. A validação rejeita referências inexistentes e verifica os valores numéricos do texto livre contra as métricas e evidências calculadas pelo backend, sem confundir unidades (uma contagem não valida o mesmo número como percentual). Se houver um valor sem respaldo, o backend solicita uma única reformulação; a resposta continua sendo rejeitada se o problema persistir. A verificação é literal e não comprova, sozinha, a correção semântica de uma afirmação. Isso reduz certos riscos, mas **não garante exatidão semântica**. Confiança é rótulo qualitativo, não probabilidade calibrada.

## Sem chave de IA

A seção **Evidências observadas** consulta `GET /api/services/:id/evidences?days=14` e funciona sem provedores externos. Os indicadores apresentados não são gerados pelo LLM.

## Privacidade

O prompt contém métricas agregadas e descrições produzidas internamente. Essa minimização reduz exposição, mas **não transforma automaticamente qualquer conjunto de métricas em dado anônimo**; em cenários empresariais, avalie contexto e autorização.

## Respostas estruturadas e limites do Groq

O adaptador Groq utiliza `response_format: json_schema` com `strict: true`. Para os modelos GPT-OSS, aplica `reasoning_effort: low` e um limite inicial configurável por `GROQ_MAX_COMPLETION_TOKENS` (padrão: 4096). Se o provedor informar especificamente que o JSON foi truncado por atingir o limite, a aplicação tenta **uma única vez** com orçamento até duas vezes maior (máximo de 16384 tokens). Erros de autenticação, esquema e outros HTTP 400 não recebem essa repetição.

O limite não é garantia de conclusão: o provedor ainda pode recusar ou interromper a geração. Mesmo em caso de sucesso, a resposta passa pela validação estrutural, verificação de IDs de evidência e checagem de números comprovados. A repetição aumenta o consumo potencial de tokens; monitore custos e limites.
