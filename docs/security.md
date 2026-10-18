# Segurança e privacidade — estado do R0

Referência: Blueprint §8 e checklist de segurança ECC. Este documento declara o que **está** implementado e o que **não está**.

## Implementado
| Domínio (§8.1) | Controlo | Evidência |
|---|---|---|
| Identidade | scrypt (N=2^17, r=8, p=1), bloqueio 15 min após 5 falhas, resposta constante a emails inexistentes, sessões opacas (256 bits) guardadas como HMAC, expiração absoluta 12 h e por inactividade 2 h, revogação ao desactivar/redefinir | `tests/integration/import-auth.test.ts` |
| Tenant | RLS fail-closed, papel sem privilégios, FKs compostas, funções SECURITY DEFINER mínimas | `tenant-isolation.test.ts` |
| Autorização | permissões por papel + âmbito need-to-know (gestores: suas vagas; entrevistadores: só onde participam, sem contactos) | `interviews.test.ts`, E2E |
| Aplicação | validação zod em todas as fronteiras; SQL parametrizado (postgres.js); sem HTML do utilizador; CSRF: Server Actions (verificação de Origin do Next) e verificação explícita de Origin no endpoint público; rate limit partilhado em Postgres (login, candidatura, pedidos do titular, IA); erros sem detalhes internos | código + testes |
| Ficheiros | allowlist por conteúdo real, 5 MB, bloqueio de EICAR/executáveis/PDF com JS/macros, nomes saneados, download com `attachment` + `nosniff`, acesso auditado | `files-and-text.test.ts`, `applications.test.ts` |
| Dados | dados mínimos por vaga, consentimento granular e versionado, retenção por finalidade, anonimização verificável, exportações auditadas | `privacy.test.ts` |
| Auditoria | só-de-acréscimo (permissões + trigger), UTC, actor, origem, correlation ID, sem PII | `audit.test.ts` |
| Cabeçalhos | HSTS, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy; `X-Powered-By` removido | `next.config.ts` |
| Exportação CSV | neutraliza injecção de fórmulas (`=`, `+`, `-`, `@`) | `csv.test.ts` |

## Requisitos de implantação
- TLS obrigatório; `APP_URL` em `https://` activa cookie `__Host-` e `Secure`.
- Proxy de confiança que **substitui** `X-Forwarded-For`/`X-Forwarded-Host` (o rate limit e a verificação de Origin dependem deles) e limita o corpo dos pedidos (ex.: 6 MB).
- `SESSION_SECRET` aleatório (32+ bytes) por ambiente; rodar invalida sessões e ligações de confirmação.
- A aplicação liga-se com `agoramoz_app`; migrações e seed com o owner, nunca em pedidos HTTP.
- Worker da outbox como processo separado em produção.

## Riscos aceites (documentados)
- `npm audit --omit=dev`: 3 moderadas em `mammoth → argparse → sprintf-js` (DoS por especificadores de formato no **CLI** do argparse). O servidor usa só `extractRawText`, sem parsing de argumentos; não há versão corrigida. Reavaliar a cada release.
- Ainda **não** implementados: MFA, CSP com nonce, antivírus, pentest — ver `backlog-status.md`.
