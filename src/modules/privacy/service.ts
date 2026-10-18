import { z } from 'zod'
import { zipSync, strToU8 } from 'fflate'
import { withTenant, type Tx } from '@/server/db/client'
import { recordAudit } from '@/server/audit/audit'
import { actorOf, type ActorContext, type RequestContext } from '@/server/context'
import { AppError, forbidden, notFound } from '@/server/errors'
import { can } from '@/server/auth/rbac'
import { parseInput } from '@/server/validation'
import { hashToken, randomToken } from '@/server/auth/tokens'
import { env } from '@/server/env'
import { storage } from '@/server/storage/storage'
import { toCsv } from '@/lib/csv'
import { enqueueTemplateMessage } from '@/modules/communications/service'

export const DSR_KINDS = {
  access: 'Acesso aos meus dados',
  export: 'Cópia dos meus dados (portabilidade)',
  rectification: 'Correcção de dados',
  erasure: 'Eliminação dos meus dados',
  objection: 'Oposição ao tratamento (ex.: talent pool)',
} as const

export type DsrKind = keyof typeof DSR_KINDS

const VERIFY_TTL_HOURS = 48
export const ANONYMIZED_NAME = 'Candidato anonimizado'

const publicDsrSchema = z.object({
  email: z.string().trim().toLowerCase().email('Email inválido'),
  kind: z.enum(Object.keys(DSR_KINDS) as [DsrKind, ...DsrKind[]], { message: 'Escolha o tipo de pedido' }),
  details: z.string().trim().max(2000).optional().transform((value) => value || null),
})

/**
 * Pedido do titular pela página pública. A resposta é sempre a mesma, exista ou não o email,
 * para não revelar quem se candidatou. A ligação de confirmação prova o controlo do email.
 */
export async function createPublicDsr(actor: ActorContext, org: { slug: string; name: string }, input: unknown): Promise<void> {
  const data = parseInput(publicDsrSchema, input)
  const token = randomToken()
  await withTenant(actor.tenantId, async (tx) => {
    const [request] = await tx<{ id: string }[]>`
      insert into data_subject_requests (tenant_id, email, kind, details, verify_token_hash)
      values (${actor.tenantId}, ${data.email}, ${data.kind}, ${data.details}, ${hashToken(token)})
      returning id
    `
    if (!request) throw new Error('insert falhou')
    await enqueueTemplateMessage(tx, actor, {
      candidateId: null,
      applicationId: null,
      to: data.email,
      templateKey: 'dsr_verification',
      vars: { empresa: org.name, link: `${env().APP_URL}/carreiras/${org.slug}/privacidade/confirmar?token=${token}` },
      idempotencyKey: `dsr_verification:${request.id}`,
    })
    await recordAudit(tx, actor, {
      action: 'privacy.request_created',
      entityType: 'data_subject_request',
      entityId: request.id,
      summary: `Pedido do titular recebido: ${DSR_KINDS[data.kind]} (por verificar)`,
      changes: { kind: data.kind },
    })
  })
}

export async function verifyDsr(actor: ActorContext, token: string): Promise<{ kind: DsrKind } | null> {
  if (!token || token.length > 128) return null
  return withTenant(actor.tenantId, async (tx) => {
    const [request] = await tx<{ id: string; kind: DsrKind; email: string }[]>`
      update data_subject_requests set status = 'open', verified_at = now(), verify_token_hash = null,
        candidate_id = (select c.id from candidates c where c.email = data_subject_requests.email and c.anonymized_at is null order by c.created_at desc limit 1)
      where verify_token_hash = ${hashToken(token)} and status = 'unverified' and created_at > now() - make_interval(hours => ${VERIFY_TTL_HOURS})
      returning id, kind, email
    `
    if (!request) return null
    await recordAudit(tx, actor, {
      action: 'privacy.request_verified',
      entityType: 'data_subject_request',
      entityId: request.id,
      summary: `Pedido do titular confirmado por email: ${DSR_KINDS[request.kind]}`,
    })
    return { kind: request.kind }
  })
}

export interface DsrRow {
  id: string
  email: string
  kind: DsrKind
  details: string | null
  status: 'unverified' | 'open' | 'completed' | 'rejected'
  candidateId: string | null
  candidateName: string | null
  verifiedAt: Date | null
  dueAt: Date
  createdAt: Date
  completedAt: Date | null
  resolution: string | null
  handlerName: string | null
}

export async function listDsrs(ctx: RequestContext): Promise<DsrRow[]> {
  if (!can(ctx.user.role, 'privacy.manage')) throw forbidden()
  return withTenant(ctx.tenantId, (tx) => tx<DsrRow[]>`
    select r.id, r.email, r.kind, r.details, r.status, r.candidate_id, c.full_name as candidate_name, r.verified_at, r.due_at,
      r.created_at, r.completed_at, r.resolution, u.full_name as handler_name
    from data_subject_requests r left join candidates c on c.id = r.candidate_id left join users u on u.id = r.handled_by
    where r.status <> 'unverified' or r.created_at > now() - interval '2 days'
    order by (r.status = 'open') desc, r.due_at
    limit 200
  `)
}

const resolveSchema = z.object({
  outcome: z.enum(['completed', 'rejected']),
  resolution: z.string().trim().min(10, 'Descreva a resposta dada ao titular (mín. 10 caracteres)').max(2000),
})

export async function resolveDsr(ctx: RequestContext, requestId: string, input: unknown): Promise<void> {
  if (!can(ctx.user.role, 'privacy.manage')) throw forbidden()
  const data = parseInput(resolveSchema, input)
  await withTenant(ctx.tenantId, async (tx) => {
    const [request] = await tx<{ id: string; kind: DsrKind }[]>`
      update data_subject_requests set status = ${data.outcome}, resolution = ${data.resolution}, handled_by = ${ctx.user.id}, completed_at = now()
      where id = ${requestId} and status = 'open' returning id, kind
    `
    if (!request) throw new AppError('CONFLICT', 'O pedido não está aberto.')
    await recordAudit(tx, actorOf(ctx), {
      action: 'privacy.request_resolved',
      entityType: 'data_subject_request',
      entityId: requestId,
      summary: `Pedido do titular ${data.outcome === 'completed' ? 'concluído' : 'recusado'}: ${DSR_KINDS[request.kind]}`,
      reason: data.resolution,
    })
  })
}

/**
 * Anonimização verificável: remove identificação e conteúdos livres, apaga ficheiros, mantém factos agregados
 * (datas, etapas, decisões) para métricas e auditoria. Irreversível.
 */
export async function anonymizeCandidate(tx: Tx, actor: ActorContext, candidateId: string, reason: string): Promise<{ filesRemoved: number }> {
  const [candidate] = await tx<{ id: string; anonymizedAt: Date | null }[]>`select id, anonymized_at from candidates where id = ${candidateId} for update`
  if (!candidate) throw notFound('Candidato')
  if (candidate.anonymizedAt) return { filesRemoved: 0 }
  const files = await tx<{ storageKey: string }[]>`delete from candidate_files where candidate_id = ${candidateId} returning storage_key`
  await tx`
    update candidates set full_name = ${ANONYMIZED_NAME}, email = null, phone = null, location = null,
      consent_talent_pool = false, consent_whatsapp = false, anonymized_at = now(), retention_until = null
    where id = ${candidateId}
  `
  await tx`update applications set answers = '[]', cover_note = null, tags = '{}', evidence = null, rejection_note = null where candidate_id = ${candidateId}`
  await tx`
    update comments set body = '[removido por anonimização]'
    where application_id in (select id from applications where candidate_id = ${candidateId})
  `
  await tx`
    update scorecards set summary = null,
      ratings = (select coalesce(jsonb_agg(jsonb_set(r, '{evidence}', '""')), '[]'::jsonb) from jsonb_array_elements(ratings) r)
    where application_id in (select id from applications where candidate_id = ${candidateId})
  `
  await tx`update messages set to_address = '[anonimizado]', body = '[removido por anonimização]', attachments = '[]' where candidate_id = ${candidateId}`
  await tx`update data_subject_requests set email = 'anonimizado@invalid' where candidate_id = ${candidateId}`
  await tx`update duplicate_suggestions set status = 'dismissed', resolved_at = now() where status = 'open' and (candidate_a = ${candidateId} or candidate_b = ${candidateId})`
  for (const file of files) await storage().remove(file.storageKey)
  await recordAudit(tx, actor, {
    action: 'privacy.anonymized',
    entityType: 'candidate',
    entityId: candidateId,
    summary: `Candidato anonimizado (${files.length} ficheiro(s) eliminado(s))`,
    changes: { filesRemoved: files.length },
    reason,
  })
  return { filesRemoved: files.length }
}

export async function eraseCandidate(ctx: RequestContext, candidateId: string, reason: string): Promise<void> {
  if (!can(ctx.user.role, 'privacy.manage')) throw forbidden()
  const cleanReason = parseInput(z.string().trim().min(10, 'Indique o fundamento (ex.: pedido do titular n.º …)'), reason)
  await withTenant(ctx.tenantId, async (tx) => {
    const [active] = await tx`select 1 from applications where candidate_id = ${candidateId} and status = 'active'`
    if (active) throw new AppError('CONFLICT', 'Existe um processo activo. Encerre-o (rejeição ou desistência) antes de anonimizar.')
    await anonymizeCandidate(tx, actorOf(ctx), candidateId, cleanReason)
  })
}

/** Dados do candidato em JSON legível (acesso/portabilidade). O acto de exportar é auditado. */
export async function exportCandidateData(ctx: RequestContext, candidateId: string): Promise<{ filename: string; json: string }> {
  if (!can(ctx.user.role, 'privacy.manage')) throw forbidden()
  return withTenant(ctx.tenantId, async (tx) => {
    const [candidate] = await tx`
      select id, full_name, email, phone, location, source, consent_processing_at, consent_version, consent_talent_pool, consent_whatsapp,
        retention_until, created_at, anonymized_at from candidates where id = ${candidateId}
    `
    if (!candidate) throw notFound('Candidato')
    const applications = await tx`
      select a.reference, coalesce(vv.title, 'Espontânea') as vaga, a.status, s.name as etapa, a.source, a.answers, a.cover_note,
        a.rejection_reason, a.created_at, a.decided_at
      from applications a left join vacancy_versions vv on vv.id = a.vacancy_version_id left join pipeline_stages s on s.id = a.stage_id
      where a.candidate_id = ${candidateId}
    `
    const files = await tx`select filename, mime, size_bytes, created_at from candidate_files where candidate_id = ${candidateId}`
    const messages = await tx`select subject, body, status, created_at, sent_at from messages where candidate_id = ${candidateId} order by created_at`
    const interviews = await tx`
      select i.starts_at, i.mode, i.status from interviews i join applications a on a.id = i.application_id where a.candidate_id = ${candidateId}
    `
    await recordAudit(tx, actorOf(ctx), { action: 'privacy.exported', entityType: 'candidate', entityId: candidateId, summary: 'Dados do titular exportados' })
    const payload = {
      geradoEm: new Date().toISOString(),
      nota: 'Exportação de dados pessoais do candidato (acesso/portabilidade). Avaliações internas de entrevistadores são fornecidas mediante análise jurídica.',
      candidato: candidate,
      candidaturas: applications,
      ficheiros: files,
      entrevistas: interviews,
      comunicacoes: messages,
    }
    return { filename: `dados-candidato-${candidateId.slice(0, 8)}.json`, json: JSON.stringify(payload, null, 2) }
  })
}

export interface RetentionCandidate {
  id: string
  fullName: string
  retentionUntil: string
  applications: number
  lastDecision: Date | null
}

async function expiredCandidates(tx: Tx): Promise<RetentionCandidate[]> {
  return tx<RetentionCandidate[]>`
    select c.id, c.full_name, c.retention_until::text as retention_until,
      (select count(*)::int from applications a where a.candidate_id = c.id) as applications,
      (select max(a.decided_at) from applications a where a.candidate_id = c.id) as last_decision
    from candidates c
    where c.anonymized_at is null and c.retention_until < current_date
      and not exists (select 1 from applications a where a.candidate_id = c.id and a.status = 'active')
    order by c.retention_until
    limit 1000
  `
}

/** Retenção por finalidade: dry-run mostra quem seria anonimizado; a execução regista relatório e evidência. */
export async function runRetention(ctx: RequestContext, dryRun: boolean): Promise<{ candidates: RetentionCandidate[]; runId: string }> {
  if (!can(ctx.user.role, 'privacy.manage')) throw forbidden()
  return withTenant(ctx.tenantId, async (tx) => {
    const candidates = await expiredCandidates(tx)
    if (!dryRun) {
      for (const candidate of candidates) await anonymizeCandidate(tx, actorOf(ctx), candidate.id, 'Prazo de retenção expirado')
    }
    const [run] = await tx<{ id: string }[]>`
      insert into retention_runs (tenant_id, run_by, dry_run, candidates_affected, report)
      values (${ctx.tenantId}, ${ctx.user.id}, ${dryRun}, ${candidates.length},
        ${tx.json(candidates.map((candidate) => ({ candidateId: candidate.id, retentionUntil: candidate.retentionUntil })) as never)})
      returning id
    `
    await recordAudit(tx, actorOf(ctx), {
      action: dryRun ? 'privacy.retention_preview' : 'privacy.retention_executed',
      entityType: 'retention_run',
      entityId: run?.id ?? null,
      summary: dryRun ? `Simulação de retenção: ${candidates.length} candidato(s) elegível(eis)` : `Retenção aplicada: ${candidates.length} candidato(s) anonimizado(s)`,
      changes: { candidatesAffected: candidates.length },
    })
    return { candidates: dryRun ? candidates : [], runId: run!.id }
  })
}

export async function listRetentionRuns(ctx: RequestContext): Promise<{ id: string; dryRun: boolean; candidatesAffected: number; createdAt: Date; runByName: string }[]> {
  if (!can(ctx.user.role, 'privacy.manage')) throw forbidden()
  return withTenant(ctx.tenantId, (tx) => tx<{ id: string; dryRun: boolean; candidatesAffected: number; createdAt: Date; runByName: string }[]>`
    select r.id, r.dry_run, r.candidates_affected, r.created_at, u.full_name as run_by_name
    from retention_runs r join users u on u.id = r.run_by order by r.created_at desc limit 20
  `)
}

/**
 * Exportação completa da organização (portabilidade, Blueprint §6.4): ZIP com CSVs documentados.
 * Não depende do estado comercial do cliente.
 */
export async function exportOrganization(ctx: RequestContext): Promise<{ filename: string; zip: Uint8Array }> {
  if (!can(ctx.user.role, 'data.export')) throw forbidden()
  return withTenant(ctx.tenantId, async (tx) => {
    const datasets: Record<string, { headers: string[]; rows: unknown[][] }> = {}
    const add = async (name: string, rows: Record<string, unknown>[]) => {
      const headers = rows[0] ? Object.keys(rows[0]) : ['sem_registos']
      datasets[name] = { headers, rows: rows.map((row) => headers.map((header) => row[header])) }
    }
    await add('requisicoes', await tx`select code, title, location, contract_type, headcount, salary_min, salary_max, reason, status, created_at, decided_at from requisitions order by created_at`)
    await add('vagas', await tx`select v.slug, vv.version, vv.title, vv.location, v.status, v.published_at, v.closed_at from vacancies v left join vacancy_versions vv on vv.id = v.published_version_id order by v.created_at`)
    await add('candidatos', await tx`select id, full_name, email, phone, location, source, consent_processing_at, consent_talent_pool, consent_whatsapp, retention_until, anonymized_at, created_at from candidates order by created_at`)
    await add('candidaturas', await tx`select a.reference, a.candidate_id, vv.title as vaga, s.name as etapa, a.status, a.source, a.rejection_reason, a.created_at, a.decided_at from applications a left join vacancy_versions vv on vv.id = a.vacancy_version_id left join pipeline_stages s on s.id = a.stage_id order by a.created_at`)
    await add('entrevistas', await tx`select i.id, a.reference, i.starts_at, i.duration_minutes, i.mode, i.status from interviews i join applications a on a.id = i.application_id order by i.starts_at`)
    await add('scorecards', await tx`select s.interview_id, a.reference, u.full_name as entrevistador, s.recommendation, s.ratings, s.summary, s.submitted_at from scorecards s join applications a on a.id = s.application_id join users u on u.id = s.author_id where s.status = 'submitted'`)
    await add('mensagens', await tx`select m.id, m.template_key, m.status, m.to_address, m.subject, m.created_at, m.sent_at from messages m order by m.created_at`)
    await add('auditoria', await tx`select e.id, e.occurred_at, e.actor_type, e.actor_id, e.action, e.entity_type, e.entity_id, e.summary, e.reason from audit_events e order by e.occurred_at limit 200000`)
    const files: Record<string, Uint8Array> = {
      'LEIA-ME.txt': strToU8(
        [
          'AGORAMOZ HR — exportação completa da organização',
          `Gerado em (UTC): ${new Date().toISOString()}`,
          '',
          'Cada ficheiro CSV usa UTF-8 com BOM, separador vírgula e datas ISO 8601 em UTC.',
          'Os ficheiros de CV não estão incluídos neste pacote; podem ser pedidos ao suporte com cadeia de custódia.',
          ...Object.entries(datasets).map(([name, data]) => `- ${name}.csv: ${data.rows.length} registo(s)`),
        ].join('\r\n'),
      ),
    }
    for (const [name, data] of Object.entries(datasets)) files[`${name}.csv`] = strToU8(toCsv(data.headers, data.rows))
    await recordAudit(tx, actorOf(ctx), {
      action: 'data.exported',
      entityType: 'organization',
      entityId: ctx.tenantId,
      summary: 'Exportação completa da organização',
      changes: Object.fromEntries(Object.entries(datasets).map(([name, data]) => [name, data.rows.length])),
    })
    return { filename: `agoramoz-hr-exportacao-${new Date().toISOString().slice(0, 10)}.zip`, zip: zipSync(files, { level: 6 }) }
  })
}
