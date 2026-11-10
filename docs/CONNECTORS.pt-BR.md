# Conexões externas

O AI Diagnostics pode consultar APIs HTTP existentes sem criar adaptadores específicos. O usuário define a URL, o método de autenticação, a localização dos registros, a paginação e os caminhos JSON dos campos.

## Modos disponíveis

| Modo | Operação | Resultado |
|---|---|---|
| `HTTP_CHECK` | GET único | Status, duração e disponibilidade observada |
| `JSON_LOGS` | GET de resposta JSON | Registros normalizados e deduplicados |

Em `JSON_LOGS`, o **caminho do array** aponta para `items` em `{ "items": [...] }`. Caminhos internos usam pontos, como `meta.status`. Os campos `event_uid`, `observed_at`, `success`, `http_status`, `duration_ms`, `error_code` e `message` são mapeáveis; os campos opcionais podem ficar vazios. Cada evento deve ter data válida, duração numérica e resultado identificável.

## Proteções atuais

- Somente GET, sem redirecionamentos automáticos e com timeout.
- Tamanho do JSON e quantidade de páginas limitados.
- Credenciais criptografadas com AES-256-GCM em repouso; a chave de criptografia não deve ser enviada ao navegador.
- Validação de URL e bloqueio de destinos privados quando `CONNECTOR_ALLOW_PRIVATE_HOSTS=false`.
- Registros duplicados ignorados por `(service_id, event_uid)`.
- Histórico de sincronizações sem armazenamento dos payloads externos.

## Limitações de segurança

O bloqueio atual de IP privado **não deve ser tratado como proteção completa contra SSRF/rebinding de DNS**. Não exponha o gerenciamento de conexões na internet sem autenticação robusta, autorização, regras de egress e revisão de segurança. Uma fonte JSON pode retornar dados pessoais mesmo quando os campos de mapeamento deixam essas informações de fora; a aplicação ainda recebe a resposta em memória. Para uso empresarial, prefira endpoints técnicos dedicados que já removam os campos sensíveis **na origem**.

A demonstração reproduzível não depende de conectores reais. Não configure um endpoint empresarial para exibir o projeto no portfólio.
