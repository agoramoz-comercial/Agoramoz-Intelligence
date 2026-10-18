-- AGORAMOZ HR — esquema inicial (R0/R1)
--
-- Princípios aplicados (Blueprint §6 e §8):
--   * tenant_id obrigatório em todas as tabelas de negócio;
--   * Row-Level Security: o papel da aplicação só vê o tenant definido em app.tenant_id;
--   * chaves estrangeiras compostas (tenant_id, id) impedem referências entre tenants,
--     porque a verificação de FK ignora RLS;
--   * auditoria só-de-acréscimo (trigger + revogação de UPDATE/DELETE);
--   * identificadores UUID para evitar enumeração de IDs.

create extension if not exists citext;
create extension if not exists pg_trgm;
create extension if not exists unaccent;

create or replace function f_unaccent(text) returns text
  language sql immutable parallel safe strict
  as $$ select public.unaccent('public.unaccent'::regdictionary, $1) $$;

-- Tenant da transacção corrente. Sem definição devolve NULL: nenhuma linha é visível (fail closed).
create or replace function app_current_tenant() returns uuid
  language sql stable
  as $$ select nullif(current_setting('app.tenant_id', true), '')::uuid $$;

create or replace function touch_updated_at() returns trigger
  language plpgsql
  as $$ begin new.updated_at := now(); return new; end $$;

create or replace function forbid_mutation() returns trigger
  language plpgsql
  as $$ begin raise exception '% é imutável (operação % recusada)', tg_table_name, tg_op using errcode = '42501'; end $$;

-- ---------------------------------------------------------------------------
-- E1 Organização e acesso
-- ---------------------------------------------------------------------------

create table organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$'),
  name text not null check (length(name) between 2 and 120),
  sector text,
  status text not null default 'active' check (status in ('active', 'suspended')),
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table departments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organizations (id) on delete cascade,
  name text not null check (length(name) between 2 and 80),
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, name)
);

create table users (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organizations (id) on delete cascade,
  email citext not null unique,
  full_name text not null check (length(full_name) between 2 and 120),
  role text not null check (role in ('org_admin', 'hr', 'hiring_manager', 'interviewer', 'executive', 'privacy_officer')),
  department_id uuid,
  password_hash text not null,
  status text not null default 'active' check (status in ('active', 'disabled')),
  failed_logins int not null default 0,
  locked_until timestamptz,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, department_id) references departments (tenant_id, id)
);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organizations (id) on delete cascade,
  user_id uuid not null,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  ip text,
  user_agent text,
  foreign key (tenant_id, user_id) references users (tenant_id, id) on delete cascade
);
create index sessions_user_idx on sessions (tenant_id, user_id);

-- Matriz de aprovação sequencial. min_salary_max: o passo só se aplica a partir deste tecto salarial.
create table approval_steps (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organizations (id) on delete cascade,
  position int not null check (position between 1 and 10),
  role text not null check (role in ('org_admin', 'hr', 'hiring_manager', 'executive')),
  label text not null,
  min_salary_max numeric(12, 2),
  unique (tenant_id, position)
);

create table tenant_counters (
  tenant_id uuid not null references organizations (id) on delete cascade,
  name text not null,
  value bigint not null default 0,
  primary key (tenant_id, name)
);

-- ---------------------------------------------------------------------------
-- E2 Requisições e vagas
-- ---------------------------------------------------------------------------

create table requisitions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organizations (id) on delete cascade,
  code text not null,
  title text not null check (length(title) between 3 and 120),
  department_id uuid,
  location text not null,
  contract_type text not null check (contract_type in ('sem_termo', 'a_prazo', 'estagio', 'prestacao_servicos', 'temporario')),
  headcount int not null default 1 check (headcount between 1 and 500),
  salary_min numeric(12, 2) check (salary_min >= 0),
  salary_max numeric(12, 2) check (salary_max >= 0),
  reason text not null check (reason in ('nova_posicao', 'substituicao', 'expansao', 'projecto')),
  justification text not null check (length(justification) between 10 and 2000),
  requirements jsonb not null default '[]'::jsonb,
  competencies jsonb not null default '[]'::jsonb,
  requested_by uuid not null,
  status text not null default 'draft' check (status in ('draft', 'pending_approval', 'approved', 'rejected', 'cancelled')),
  current_step int,
  submitted_at timestamptz,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (salary_min is null or salary_max is null or salary_min <= salary_max),
  unique (tenant_id, id),
  unique (tenant_id, code),
  foreign key (tenant_id, department_id) references departments (tenant_id, id),
  foreign key (tenant_id, requested_by) references users (tenant_id, id)
);
create trigger requisitions_touch before update on requisitions for each row execute function touch_updated_at();
create index requisitions_status_idx on requisitions (tenant_id, status);

create table requisition_approvals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organizations (id) on delete cascade,
  requisition_id uuid not null,
  step_position int not null,
  role text not null,
  decided_by uuid not null,
  decision text not null check (decision in ('approved', 'rejected')),
  comment text,
  decided_at timestamptz not null default now(),
  unique (requisition_id, step_position),
  foreign key (tenant_id, requisition_id) references requisitions (tenant_id, id) on delete cascade,
  foreign key (tenant_id, decided_by) references users (tenant_id, id)
);

create table vacancies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organizations (id) on delete cascade,
  requisition_id uuid not null,
  slug text not null check (slug ~ '^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$'),
  status text not null default 'draft' check (status in ('draft', 'published', 'closed')),
  owner_id uuid not null,
  published_version_id uuid,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  closed_at timestamptz,
  unique (tenant_id, id),
  unique (tenant_id, slug),
  unique (tenant_id, requisition_id),
  foreign key (tenant_id, requisition_id) references requisitions (tenant_id, id),
  foreign key (tenant_id, owner_id) references users (tenant_id, id)
);

-- Versão publicada: fotografia imutável do que o candidato viu.
create table vacancy_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organizations (id) on delete cascade,
  vacancy_id uuid not null,
  version int not null check (version >= 1),
  title text not null,
  summary text not null,
  description text not null,
  requirements jsonb not null,
  competencies jsonb not null,
  screening_questions jsonb not null default '[]'::jsonb,
  location text not null,
  contract_type text not null,
  salary_visible boolean not null default false,
  salary_min numeric(12, 2),
  salary_max numeric(12, 2),
  closes_on date,
  published_by uuid not null,
  published_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (vacancy_id, version),
  foreign key (tenant_id, vacancy_id) references vacancies (tenant_id, id) on delete cascade,
  foreign key (tenant_id, published_by) references users (tenant_id, id)
);
create trigger vacancy_versions_immutable before update on vacancy_versions for each row execute function forbid_mutation();

alter table vacancies
  add foreign key (tenant_id, published_version_id) references vacancy_versions (tenant_id, id);

create table pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organizations (id) on delete cascade,
  vacancy_id uuid not null,
  position int not null check (position between 1 and 20),
  name text not null,
  kind text not null check (kind in ('new', 'screening', 'interview', 'assessment', 'offer', 'hired')),
  unique (tenant_id, id),
  unique (vacancy_id, position),
  foreign key (tenant_id, vacancy_id) references vacancies (tenant_id, id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- E3 Candidatos e candidaturas
-- ---------------------------------------------------------------------------

create table candidates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organizations (id) on delete cascade,
  full_name text not null,
  email citext,
  phone text,
  location text,
  source text not null default 'careers_page',
  consent_processing_at timestamptz not null,
  consent_version text not null,
  consent_talent_pool boolean not null default false,
  consent_whatsapp boolean not null default false,
  retention_until date,
  anonymized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search_text tsvector generated always as (
    to_tsvector('simple', f_unaccent(coalesce(full_name, '') || ' ' || coalesce(email::text, '') || ' ' || coalesce(location, '') || ' ' || coalesce(phone, '')))
  ) stored,
  unique (tenant_id, id)
);
create trigger candidates_touch before update on candidates for each row execute function touch_updated_at();
create index candidates_search_idx on candidates using gin (search_text);
create index candidates_name_trgm_idx on candidates using gin (f_unaccent(lower(full_name)) gin_trgm_ops);
create index candidates_email_idx on candidates (tenant_id, email);
create index candidates_phone_idx on candidates (tenant_id, phone);
create index candidates_retention_idx on candidates (tenant_id, retention_until) where anonymized_at is null;

create table applications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organizations (id) on delete cascade,
  candidate_id uuid not null,
  vacancy_id uuid,
  vacancy_version_id uuid,
  stage_id uuid,
  reference text not null,
  status text not null default 'active' check (status in ('active', 'hired', 'rejected', 'withdrawn')),
  source text not null check (source in ('careers_page', 'email', 'whatsapp', 'import', 'referral', 'manual', 'spontaneous')),
  owner_id uuid,
  answers jsonb not null default '[]'::jsonb,
  cover_note text,
  tags text[] not null default '{}',
  evidence jsonb,
  rejection_reason text check (rejection_reason in ('requisitos_obrigatorios', 'experiencia_insuficiente', 'outro_candidato', 'desistencia', 'nao_compareceu', 'vaga_cancelada', 'outro')),
  rejection_note text,
  created_at timestamptz not null default now(),
  stage_entered_at timestamptz not null default now(),
  decided_at timestamptz,
  unique (tenant_id, id),
  unique (tenant_id, reference),
  unique (candidate_id, vacancy_id),
  check (status <> 'rejected' or rejection_reason is not null),
  foreign key (tenant_id, candidate_id) references candidates (tenant_id, id) on delete cascade,
  foreign key (tenant_id, vacancy_id) references vacancies (tenant_id, id),
  foreign key (tenant_id, vacancy_version_id) references vacancy_versions (tenant_id, id),
  foreign key (tenant_id, stage_id) references pipeline_stages (tenant_id, id),
  foreign key (tenant_id, owner_id) references users (tenant_id, id)
);
create index applications_vacancy_idx on applications (tenant_id, vacancy_id, status);
create index applications_stage_idx on applications (tenant_id, stage_id);
create index applications_created_idx on applications (tenant_id, created_at);

create table candidate_files (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organizations (id) on delete cascade,
  candidate_id uuid not null,
  application_id uuid,
  kind text not null default 'cv' check (kind in ('cv', 'other')),
  filename text not null,
  mime text not null,
  size_bytes int not null check (size_bytes > 0),
  sha256 text not null,
  storage_key text not null unique,
  scan_status text not null default 'pending' check (scan_status in ('pending', 'clean', 'infected', 'error')),
  scan_detail text,
  text_content text,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, candidate_id) references candidates (tenant_id, id) on delete cascade,
  foreign key (tenant_id, application_id) references applications (tenant_id, id) on delete set null (application_id)
);
create index candidate_files_candidate_idx on candidate_files (tenant_id, candidate_id);

create table comments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organizations (id) on delete cascade,
  application_id uuid not null,
  author_id uuid not null,
  body text not null check (length(body) between 1 and 4000),
  created_at timestamptz not null default now(),
  foreign key (tenant_id, application_id) references applications (tenant_id, id) on delete cascade,
  foreign key (tenant_id, author_id) references users (tenant_id, id)
);
create index comments_application_idx on comments (tenant_id, application_id);

-- Duplicados são sugeridos, nunca fundidos automaticamente (HR-023).
create table duplicate_suggestions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organizations (id) on delete cascade,
  candidate_a uuid not null,
  candidate_b uuid not null,
  reasons text[] not null,
  status text not null default 'open' check (status in ('open', 'merged', 'dismissed')),
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  check (candidate_a < candidate_b),
  unique (candidate_a, candidate_b),
  foreign key (tenant_id, candidate_a) references candidates (tenant_id, id) on delete cascade,
  foreign key (tenant_id, candidate_b) references candidates (tenant_id, id) on delete cascade,
  foreign key (tenant_id, resolved_by) references users (tenant_id, id)
);

-- ---------------------------------------------------------------------------
-- E5 Entrevistas e scorecards
-- ---------------------------------------------------------------------------

create table interviews (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organizations (id) on delete cascade,
  application_id uuid not null,
  starts_at timestamptz not null,
  duration_minutes int not null default 45 check (duration_minutes between 10 and 480),
  mode text not null check (mode in ('presencial', 'video', 'telefone')),
  location text,
  status text not null default 'scheduled' check (status in ('scheduled', 'completed', 'cancelled')),
  ics_sequence int not null default 0,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, application_id) references applications (tenant_id, id) on delete cascade,
  foreign key (tenant_id, created_by) references users (tenant_id, id)
);
create index interviews_starts_idx on interviews (tenant_id, starts_at);

create table interview_participants (
  tenant_id uuid not null references organizations (id) on delete cascade,
  interview_id uuid not null,
  user_id uuid not null,
  primary key (interview_id, user_id),
  foreign key (tenant_id, interview_id) references interviews (tenant_id, id) on delete cascade,
  foreign key (tenant_id, user_id) references users (tenant_id, id)
);
create index interview_participants_user_idx on interview_participants (tenant_id, user_id);

create table scorecards (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organizations (id) on delete cascade,
  interview_id uuid not null,
  application_id uuid not null,
  author_id uuid not null,
  criteria_version_id uuid not null,
  ratings jsonb not null default '[]'::jsonb,
  recommendation text check (recommendation in ('strong_yes', 'yes', 'no', 'strong_no')),
  summary text,
  status text not null default 'draft' check (status in ('draft', 'submitted')),
  submitted_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (interview_id, author_id),
  check (status <> 'submitted' or (recommendation is not null and submitted_at is not null)),
  foreign key (tenant_id, interview_id) references interviews (tenant_id, id) on delete cascade,
  foreign key (tenant_id, application_id) references applications (tenant_id, id) on delete cascade,
  foreign key (tenant_id, author_id) references users (tenant_id, id),
  foreign key (tenant_id, criteria_version_id) references vacancy_versions (tenant_id, id)
);
create trigger scorecards_touch before update on scorecards for each row execute function touch_updated_at();
create index scorecards_application_idx on scorecards (tenant_id, application_id);

-- ---------------------------------------------------------------------------
-- E6 Comunicação (outbox transaccional)
-- ---------------------------------------------------------------------------

create table message_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organizations (id) on delete cascade,
  key text not null check (key in ('application_received', 'interview_invitation', 'interview_cancelled', 'stage_progress', 'rejection', 'hired', 'dsr_verification', 'information_request')),
  channel text not null default 'email' check (channel in ('email', 'whatsapp')),
  subject text not null,
  body text not null,
  updated_at timestamptz not null default now(),
  unique (tenant_id, key, channel)
);
create trigger message_templates_touch before update on message_templates for each row execute function touch_updated_at();

create table messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organizations (id) on delete cascade,
  candidate_id uuid,
  application_id uuid,
  channel text not null check (channel in ('email', 'whatsapp')),
  to_address text not null,
  subject text not null,
  body text not null,
  template_key text,
  attachments jsonb not null default '[]'::jsonb,
  idempotency_key text not null,
  status text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'failed', 'dead')),
  attempts int not null default 0,
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  last_error text,
  provider_message_id text,
  created_by uuid,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (tenant_id, idempotency_key),
  foreign key (tenant_id, candidate_id) references candidates (tenant_id, id) on delete set null (candidate_id),
  foreign key (tenant_id, application_id) references applications (tenant_id, id) on delete set null (application_id)
);
create index messages_queue_idx on messages (next_attempt_at) where status in ('queued', 'failed');
create index messages_application_idx on messages (tenant_id, application_id);

-- ---------------------------------------------------------------------------
-- E8 Auditoria (só-de-acréscimo, sem dados pessoais em claro)
-- ---------------------------------------------------------------------------

create table audit_events (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references organizations (id),
  occurred_at timestamptz not null default now(),
  actor_type text not null check (actor_type in ('user', 'candidate', 'system')),
  actor_id uuid,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  summary text not null,
  changes jsonb not null default '{}'::jsonb,
  reason text,
  ip text,
  user_agent text,
  correlation_id text
);
create index audit_events_time_idx on audit_events (tenant_id, occurred_at desc);
create index audit_events_entity_idx on audit_events (tenant_id, entity_type, entity_id);
create index audit_events_action_idx on audit_events (tenant_id, action);
create trigger audit_events_no_update before update or delete on audit_events for each row execute function forbid_mutation();
create trigger audit_events_no_truncate before truncate on audit_events for each statement execute function forbid_mutation();

-- ---------------------------------------------------------------------------
-- Privacidade, retenção e IA
-- ---------------------------------------------------------------------------

create table data_subject_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organizations (id) on delete cascade,
  candidate_id uuid,
  email citext not null,
  kind text not null check (kind in ('access', 'rectification', 'erasure', 'objection', 'export')),
  details text,
  status text not null default 'unverified' check (status in ('unverified', 'open', 'completed', 'rejected')),
  verify_token_hash text unique,
  verified_at timestamptz,
  handled_by uuid,
  resolution text,
  completed_at timestamptz,
  due_at timestamptz not null default (now() + interval '30 days'),
  created_at timestamptz not null default now(),
  foreign key (tenant_id, candidate_id) references candidates (tenant_id, id) on delete set null (candidate_id),
  foreign key (tenant_id, handled_by) references users (tenant_id, id)
);
create index dsr_status_idx on data_subject_requests (tenant_id, status);

create table retention_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organizations (id) on delete cascade,
  run_by uuid not null,
  dry_run boolean not null,
  candidates_affected int not null,
  report jsonb not null,
  created_at timestamptz not null default now(),
  foreign key (tenant_id, run_by) references users (tenant_id, id)
);

create table ai_interactions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organizations (id) on delete cascade,
  user_id uuid not null,
  use_case text not null check (use_case in ('job_description', 'cv_summary')),
  entity_id uuid,
  model text not null,
  prompt_version text not null,
  input_sha256 text not null,
  output jsonb,
  grounding jsonb,
  latency_ms int,
  input_tokens int,
  output_tokens int,
  error text,
  human_action text check (human_action in ('accepted', 'edited', 'discarded', 'reported')),
  created_at timestamptz not null default now(),
  foreign key (tenant_id, user_id) references users (tenant_id, id)
);

-- Limitação de taxa partilhada entre instâncias (login, candidatura pública, pedidos de titular).
create table rate_limits (
  key text primary key,
  window_started_at timestamptz not null,
  hits int not null
);

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------

alter table organizations enable row level security;
create policy tenant_isolation on organizations
  using (id = app_current_tenant()) with check (id = app_current_tenant());

do $$
declare
  t text;
begin
  foreach t in array array[
    'departments', 'users', 'sessions', 'approval_steps', 'tenant_counters', 'requisitions',
    'requisition_approvals', 'vacancies', 'vacancy_versions', 'pipeline_stages', 'candidates',
    'applications', 'candidate_files', 'comments', 'duplicate_suggestions', 'interviews',
    'interview_participants', 'scorecards', 'message_templates', 'messages', 'audit_events',
    'data_subject_requests', 'retention_runs', 'ai_interactions'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy tenant_isolation on %I using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant())',
      t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Funções de sistema (SECURITY DEFINER): pontos de entrada antes de conhecer o tenant.
-- Devolvem o mínimo necessário e são as únicas que atravessam tenants.
-- ---------------------------------------------------------------------------

create or replace function auth_lookup_user(p_email text)
  returns table (id uuid, tenant_id uuid, password_hash text, status text, failed_logins int, locked_until timestamptz, org_status text)
  language sql stable security definer set search_path = public, pg_temp
  as $$
    select u.id, u.tenant_id, u.password_hash, u.status, u.failed_logins, u.locked_until, o.status
    from users u join organizations o on o.id = u.tenant_id
    where u.email = p_email::citext
  $$;

create or replace function auth_lookup_session(p_token_hash text)
  returns table (session_id uuid, user_id uuid, tenant_id uuid, expires_at timestamptz)
  language sql stable security definer set search_path = public, pg_temp
  as $$
    select s.id, s.user_id, s.tenant_id, s.expires_at
    from sessions s
    join users u on u.id = s.user_id and u.status = 'active'
    join organizations o on o.id = s.tenant_id and o.status = 'active'
    where s.token_hash = p_token_hash and s.revoked_at is null and s.expires_at > now()
  $$;

create or replace function public_org_by_slug(p_slug text)
  returns table (id uuid, slug text, name text, sector text)
  language sql stable security definer set search_path = public, pg_temp
  as $$
    select o.id, o.slug, o.name, o.sector from organizations o where o.slug = p_slug and o.status = 'active'
  $$;

-- Reserva mensagens prontas a enviar, de todos os tenants, para o worker.
create or replace function outbox_claim(p_limit int)
  returns table (id uuid, tenant_id uuid)
  language sql volatile security definer set search_path = public, pg_temp
  as $$
    update messages m set status = 'sending', locked_at = now()
    where m.id in (
      select q.id from messages q
      where (q.status in ('queued', 'failed') and q.next_attempt_at <= now())
         or (q.status = 'sending' and q.locked_at < now() - interval '10 minutes')
      order by q.next_attempt_at
      limit greatest(1, least(p_limit, 100))
      for update skip locked
    )
    returning m.id, m.tenant_id
  $$;

-- Janela fixa: devolve true se o pedido cabe no limite.
create or replace function rate_limit_hit(p_key text, p_window_seconds int, p_max int)
  returns boolean
  language plpgsql volatile security definer set search_path = public, pg_temp
  as $$
  declare
    v_hits int;
  begin
    insert into rate_limits as r (key, window_started_at, hits) values (p_key, now(), 1)
    on conflict (key) do update set
      hits = case when r.window_started_at < now() - make_interval(secs => p_window_seconds) then 1 else r.hits + 1 end,
      window_started_at = case when r.window_started_at < now() - make_interval(secs => p_window_seconds) then now() else r.window_started_at end
    returning hits into v_hits;
    return v_hits <= p_max;
  end $$;
