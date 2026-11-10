# Plano de avaliação

## O que é efetivamente verificado

O script `npm run demo:evaluate` consulta o PostgreSQL e verifica, para cada cenário sintético, **total de execuções, total de falhas e IDs das evidências geradas**. Qualquer divergência gera falha no processo. Testes unitários validam o esquema dos eventos, os horários, a repetibilidade da geração e os padrões esperados. Os testes de integração existentes exercitam a API e a persistência em PostgreSQL real.

| Cenário | Falhas previstas | Verificação principal |
|---|---:|---|
| Checkout API | 20/48 | `EV-429`, `EV-5XX`, `EV-TREND` |
| Catalog API | 0/40 | Apenas linha de base; nenhum padrão artificial |
| Search API | 0/32 | `EV-LATENCY` |
| Background Jobs | 9/30 | `EV-TIMEOUT`, `EV-LATENCY`, `EV-TREND` |

## Modelo de IA

O comando `npm run demo:evaluate -- --llm` é **opcional** e chama um modelo real. Ele verifica se o JSON segue o contrato e se as hipóteses citam evidências válidas. A validação não mede se a explicação é causalmente correta. Como as respostas variam, o teste determinístico não depende do LLM e não incorpora alegações de precisão percentuais sem um conjunto de referência anotado.

## Critérios de uma avaliação futura mais forte

1. Construir cenários de referência com explicações aprovadas por revisores humanos.
2. Classificar afirmações por evidência suficiente, hipótese plausível e causalidade não demonstrada.
3. Registrar modelo, versão, parâmetros, conjunto de testes, custo, latência e taxa de falhas do provedor.
4. Comparar modelos com as mesmas entradas e regras de validação.
5. Avaliar casos adversários: dados escassos, mensagens com instruções injetadas e métricas contraditórias.

**Limitação explícita:** evidência correta e formato válido não equivalem à identificação correta da causa raiz.
