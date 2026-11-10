# Segurança e privacidade

## Objetivo

Evitar que uma demonstração de observabilidade exponha segredos, informações pessoais ou sistemas empresariais. Este projeto é **local-first**, não um serviço público multiusuário.

## Recomendações práticas

- Nunca publique `backend/.env`, credenciais, JWTs, backups PostgreSQL, logs empresariais ou capturas que mostrem dados de clientes.
- Utilize `backend/.env.example` com valores de exemplo e gere suas próprias chaves em ambiente local.
- Mantenha o backend no endereço de loopback em demonstrações.
- Não use credenciais administrativas de produção no vídeo, README ou base sintética.
- Faça a demonstração com `npm run demo:seed`; ela não consulta servidores remotos.
- Revise `git status`, `git diff --cached` e o histórico antes de publicar; `.gitignore` não remove segredos já commitados.
- Se uma credencial já tiver aparecido em captura, código ou chat, troque-a e invalide sessões relacionadas conforme o serviço.

## Proteções implementadas

Validação Zod, SQL parametrizado, requisições HTTP limitadas, rejeição de URLs de esquema não suportado, controle básico de concorrência, criptografia AES-GCM de segredos de conexão e validação do resultado de IA. O script de demonstração aceita apenas PostgreSQL local e recusa `NODE_ENV=production`. O prompt de IA usa agregados e evidências geradas no backend, sem mensagens brutas ou nomes de projetos/serviços.

## Riscos conhecidos / trabalhos futuros

1. **Autenticação e autorização:** a chave única de gerenciamento não substitui login, RBAC e isolamento entre organizações; rotas de leitura e análise precisam de política de acesso em implantação pública.
2. **SSRF e DNS rebinding:** validação de IP antes de `fetch` não fixa o endereço realmente utilizado. Para produção, impor allowlist e proxy de egress que proteja também conexões IPv4/IPv6 e redirecionamentos.
3. **Dados pessoais:** o redator textual usa padrões limitados; não é anonimização completa. Proibir dados brutos na origem, definir retenção e realizar auditoria de privacidade.
4. **Observabilidade do próprio monitor:** adicionar métricas de processo, alarmes, auditoria estruturada e rastreamento de falhas de sincronização.
5. **Fila e escala:** persistir tarefas, controlar tentativas e garantir agendamento/deduplicação concorrente entre instâncias.
6. **Segredos:** considerar cofre dedicado e rotação de credenciais em operação empresarial.

A presença desses itens como limitações explícitas é parte da documentação de engenharia: não devem ser apresentados como recursos já concluídos.
