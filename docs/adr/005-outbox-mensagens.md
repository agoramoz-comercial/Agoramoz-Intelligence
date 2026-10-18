# ADR-005 — Outbox transaccional para comunicação

- Estado: aceite · Blueprint E6, §7.2

## Decisão
- A mensagem é inserida na tabela `messages` dentro da transacção do evento de negócio (candidatura, rejeição, entrevista). Nunca se envia email a meio de uma transacção.
- `idempotency_key` única por tenant (ex.: `rejection:<applicationId>`) impede duplicados por duplo clique ou repetição.
- Entrega: imediata após a resposta HTTP (`after()`), e worker contínuo (`npm run worker`) como rede de segurança. `outbox_claim` usa `FOR UPDATE SKIP LOCKED` e recupera mensagens presas em `sending` há mais de 10 minutos.
- Falhas: 1, 5, 30 e 120 minutos; à 5.ª falha passa a `dead` (dead-letter) e fica visível com o erro; reenvio manual auditado.
- Convites de entrevista levam anexo iCalendar (`METHOD:REQUEST`/`CANCEL`, `SEQUENCE`), compatível com Outlook e Google sem integração — o Microsoft Graph (P1) fica para depois da prova técnica.
- Fornecedores: `log` (desenvolvimento/pilotos sem SMTP: a mensagem é registada e visível) e `smtp` (nodemailer). WhatsApp (Should, R1.1) entra pelo mesmo contrato com opt-in já recolhido no formulário.
