# Operação e runbooks (R0)

## Variáveis de ambiente
Ver `.env.example`. Obrigatórias: `DATABASE_URL` (papel `agoramoz_app`), `SESSION_SECRET`, `APP_URL`. Migrações/seed: `DATABASE_ADMIN_URL`. Email: `EMAIL_PROVIDER=smtp` + `SMTP_URL` + `EMAIL_FROM`. IA: `AI_ENABLED=true` + `ANTHROPIC_API_KEY` (`AI_MODEL`, por defeito `claude-opus-5-5`). Página comercial: `CONTACT_EMAIL` (lido no build).

## Processos
| Processo | Comando | Nota |
|---|---|---|
| Web | `npm run build && npm start` | sem estado; escala horizontalmente |
| Worker da outbox | `npm run worker` | um ou mais; `FOR UPDATE SKIP LOCKED` evita envios duplicados |
| Migrações | `npm run db:migrate` | antes de cada deploy; checksum impede alterar migrações aplicadas |
| Saúde | `GET /api/health` | 200 com BD acessível, 503 caso contrário |

## Runbooks (Blueprint §16.3)
- **Nova empresa cliente**: `provisionOrganization` (script de plataforma) com admin, departamentos e slug; ajustar matriz de aprovação com o cliente.
- **Falha de email**: `/app/mensagens?estado=failed|dead` mostra o erro; corrigir SMTP e usar "Reenviar"; dead-letter nunca é reenviado sozinho.
- **Mensagem duplicada**: verificar `idempotency_key`; duplicados não são possíveis para a mesma chave.
- **CV com malware**: o upload é recusado com mensagem ao candidato e evento `application.submitted` não é criado; nada fica guardado.
- **Pedido de titular**: `/app/privacidade` → associar registo → exportar JSON ou anonimizar → encerrar com resposta escrita (prazo 30 dias).
- **Retenção**: simular em `/app/privacidade`, rever a lista, executar; relatório em `retention_runs`.
- **Saída do cliente**: `/app/privacidade` → "Exportar todos os dados (ZIP)"; CVs entregues à parte com cadeia de custódia.
- **Rotação de segredo**: novo `SESSION_SECRET` → todos reentram; ligações de confirmação pendentes expiram.
- **Acesso indevido suspeito**: pesquisar `/app/auditoria` por actor/IP/correlation ID; desactivar o utilizador (revoga sessões); exportar o registo.
- **Restauro**: backups PostgreSQL + armazenamento de objectos com a mesma marca temporal; ensaiar antes do piloto (RPO ≤ 24 h, RTO ≤ 8 h).
