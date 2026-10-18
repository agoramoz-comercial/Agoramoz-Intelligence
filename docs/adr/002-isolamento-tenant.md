# ADR-002 — Isolamento de tenant em duas camadas

- Estado: aceite · Blueprint §8.1 "tenant_id obrigatório, políticas e testes cross-tenant"

## Decisão
1. **Aplicação**: cada serviço recebe um `RequestContext` com `tenantId` e verifica permissão (`can(role, permission)`) e âmbito need-to-know (`applicationScope`, `vacancyScope`).
2. **Base de dados**: todas as tabelas de negócio têm `tenant_id`, RLS activa com `tenant_id = app_current_tenant()`; a aplicação liga-se com o papel `agoramoz_app` (sem superuser, sem BYPASSRLS, não-owner) e fixa `app.tenant_id` por transacção (`withTenant`). Sem tenant definido, nenhuma linha é visível (fail closed).
3. **Integridade**: chaves estrangeiras compostas `(tenant_id, x_id)`, porque a verificação de FK ignora RLS — sem elas um UUID de outro tenant poderia ser referenciado.
4. **Entradas sem tenant** (login, sessão, página pública, worker) passam por funções `SECURITY DEFINER` que devolvem o mínimo: `auth_lookup_user`, `auth_lookup_session`, `public_org_by_slug`, `outbox_claim`, `rate_limit_hit`.
5. IDs UUID (não sequenciais) para impedir enumeração.

## Evidência
`tests/integration/tenant-isolation.test.ts`: fail-closed, WITH CHECK, FK composta, NOT_FOUND entre tenants, papel sem privilégios.
