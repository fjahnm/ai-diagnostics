# Demonstração reproduzível

Este roteiro usa exclusivamente dados sintéticos. Não requer acesso a APIs de empresas, JWT de produção ou chaves de IA.

## Preparação

Com PostgreSQL iniciado e backend configurado em `backend/.env`, execute no terminal dentro de `backend`:

```powershell
npm run demo:seed
npm run demo:evaluate
```

O primeiro comando **substitui somente eventos e análises** do projeto reservado `ai-diagnostics-showcase`. Se houver conexões ligadas a esse projeto ou serviços desconhecidos, ele interrompe a execução. Não afeta nenhum outro projeto nem o volume do banco. O segundo verifica contagens e IDs de evidências, sem chamar IA.

## Navegação

1. Abra `http://127.0.0.1:5173`, atualize a página e escolha **AI Diagnostics — Demonstração**.
2. Selecione **Últimos 14 dias**. O painel deve indicar **150 execuções e 29 falhas** no projeto sintético em uma base recém-gerada.
3. Abra **Checkout API**: identifique erros HTTP de limitação de taxa, erros de servidor e aumento recente de falhas.
4. Abra **Catalog API**: veja a linha de base saudável sem sinais de anomalias inventadas.
5. Abra **Search API**: confira latência média elevada mesmo com requisições bem-sucedidas.
6. Abra **Background Jobs**: examine execuções com falhas sem HTTP, latência alta e mudança de tendência.
7. Em cada serviço, consulte **Evidências observadas**; elas são calculadas sem LLM.
8. Opcionalmente, configure um provedor e use **Analisar com IA** para gerar hipóteses reais. A IA pode falhar ou retornar interpretações diferentes; erros não são mascarados.

## Resultados esperados

| Cenário | Eventos | Falhas | Evidências |
|---|---:|---:|---|
| Checkout API | 48 | 20 | `EV-BASE`, `EV-429`, `EV-5XX`, `EV-TREND` |
| Catalog API | 40 | 0 | `EV-BASE` |
| Search API | 32 | 0 | `EV-BASE`, `EV-LATENCY` |
| Background Jobs | 30 | 9 | `EV-BASE`, `EV-TIMEOUT`, `EV-LATENCY`, `EV-TREND` |

Os horários são calculados em relação à execução do comando. Reexecutar o seed atualiza as datas, para evitar uma demonstração vazia após o avanço do calendário. Os totais esperados referem-se ao projeto reservado, não a **Todos os projetos**.

## Avaliação opcional com LLM

```powershell
npm run demo:evaluate -- --llm
```

A opção executa análises reais, verifica a estrutura e a validade das referências e grava resultados no histórico. **Ela utiliza a API configurada**, podendo consumir cota. Não mede precisão clínica/causal e não fornece métricas de produtividade não verificadas.

## Sugestão para gravar um vídeo curto

Mostre a visão geral com os quatro serviços, abra Checkout API, destaque a seção de evidências e execute uma análise com IA somente se houver provedor configurado. Termine mostrando os testes automatizados. Informe na descrição que os eventos são sintéticos e que as hipóteses não equivalem a causas confirmadas.
