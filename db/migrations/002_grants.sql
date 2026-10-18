-- Privilégios do papel da aplicação (agoramoz_app).
-- O papel é criado fora das migrações (scripts/db-setup.ts ou provisionamento da cloud),
-- nunca é owner das tabelas e nunca tem BYPASSRLS: a RLS aplica-se sempre.

revoke all on schema public from public;
grant usage on schema public to agoramoz_app;

grant select, insert, update, delete on all tables in schema public to agoramoz_app;
grant usage, select on all sequences in schema public to agoramoz_app;

-- Auditoria: apenas leitura e acréscimo.
revoke update, delete, truncate on audit_events from agoramoz_app;
-- Versões publicadas: nunca alteradas; organizações: criadas só pelo provisionamento.
revoke update, delete on vacancy_versions from agoramoz_app;
revoke insert, delete on organizations from agoramoz_app;
-- Tabelas de sistema acedidas apenas através de funções.
revoke all on rate_limits from agoramoz_app;

revoke all on function auth_lookup_user(text) from public;
revoke all on function auth_lookup_session(text) from public;
revoke all on function public_org_by_slug(text) from public;
revoke all on function outbox_claim(int) from public;
revoke all on function rate_limit_hit(text, int, int) from public;
grant execute on function auth_lookup_user(text) to agoramoz_app;
grant execute on function auth_lookup_session(text) to agoramoz_app;
grant execute on function public_org_by_slug(text) to agoramoz_app;
grant execute on function outbox_claim(int) to agoramoz_app;
grant execute on function rate_limit_hit(text, int, int) to agoramoz_app;
