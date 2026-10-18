import { z } from 'zod'
import { appSql, withTenant, type Tx } from '@/server/db/client'
import { recordAudit } from '@/server/audit/audit'
import { actorOf, systemActor, type ActorContext, type RequestContext } from '@/server/context'
import { AppError, forbidden, notFound } from '@/server/errors'
import { can } from '@/server/auth/rbac'
import { parseInput } from '@/server/validation'
import { mailProvider, type OutgoingAttachment } from '@/server/mail/provider'
import { TEMPLATE_LABELS, type TemplateKey } from './defaults'
import { nextAttemptDelayMinutes, renderTemplate, type TemplateVars } from './render'

export interface EnqueueInput {
  candidateId: string | null
  applicationId: string | null
  to: string
  templateKey: TemplateKey
  vars: TemplateVars
  idempotencyKey: string
  attachments?: OutgoingAttachment[]
  createdBy?: string | null
}

/**
 * Coloca uma mensagem na outbox dentro da transacção do evento de negócio.
 * A mesma chave de idempotência nunca gera duas mensagens (ex.: duplo clique, repetição de pedido).
 */
export async function enqueueTemplateMessage(tx: Tx, actor: ActorContext, input: EnqueueInput): Promise<string | null> {
  const [template] = await tx<{ subject: string; body: string }[]>`
    select subject, body from message_templates where key = ${input.templateKey} and channel = 'email'
  `
  if (!template) throw new Error(`Modelo ${input.templateKey} em falta`)
  const [row] = await tx<{ id: string }[]>`
    insert into messages (
      tenant_id, candidate_id, application_id, channel, to_address, subject, body, template_key, attachments, idempotency_key, created_by
    ) values (
      ${actor.tenantId}, ${input.candidateId}, ${input.applicationId}, 'email', ${input.to},
      ${renderTemplate(template.subject, input.vars)}, ${renderTemplate(template.body, input.vars)}, ${input.templateKey},
      ${tx.json((input.attachments ?? []) as never)}, ${input.idempotencyKey}, ${input.createdBy ?? null}
    )
    on conflict (tenant_id, idempotency_key) do nothing
    returning id
  `
  if (row) {
    await recordAudit(tx, actor, {
      action: 'message.queued',
      entityType: 'message',
      entityId: row.id,
      summary: `Mensagem em fila: ${TEMPLATE_LABELS[input.templateKey]}`,
      changes: { templateKey: input.templateKey, applicationId: input.applicationId },
    })
  }
  return row?.id ?? null
}

interface ClaimedMessage {
  id: string
  tenantId: string
  toAddress: string
  subject: string
  body: string
  attachments: OutgoingAttachment[]
  attempts: number
}

async function deliver(message: ClaimedMessage): Promise<'sent' | 'failed' | 'dead'> {
  try {
    const result = await mailProvider().send({
      to: message.toAddress,
      subject: message.subject,
      text: message.body,
      attachments: message.attachments,
      messageId: message.id,
    })
    await withTenant(message.tenantId, async (tx) => {
      await tx`
        update messages set status = 'sent', sent_at = now(), attempts = attempts + 1, provider_message_id = ${result.providerMessageId},
          last_error = null, locked_at = null
        where id = ${message.id}
      `
      await recordAudit(tx, systemActor(message.tenantId), { action: 'message.sent', entityType: 'message', entityId: message.id, summary: 'Mensagem entregue ao fornecedor' })
    })
    return 'sent'
  } catch (error: unknown) {
    const attempts = message.attempts + 1
    const delay = nextAttemptDelayMinutes(attempts)
    const reason = (error instanceof Error ? error.message : 'Erro desconhecido').slice(0, 500)
    await withTenant(message.tenantId, async (tx) => {
      await tx`
        update messages set status = ${delay === null ? 'dead' : 'failed'}, attempts = ${attempts}, last_error = ${reason}, locked_at = null,
          next_attempt_at = now() + make_interval(mins => ${delay ?? 0})
        where id = ${message.id}
      `
      await recordAudit(tx, systemActor(message.tenantId), {
        action: delay === null ? 'message.dead_lettered' : 'message.failed',
        entityType: 'message',
        entityId: message.id,
        summary: delay === null ? 'Envio esgotou as tentativas (dead-letter)' : `Falha no envio; nova tentativa em ${delay} min`,
        reason,
      })
    })
    return delay === null ? 'dead' : 'failed'
  }
}

/** Processa a outbox de todos os tenants (worker ou disparo após resposta HTTP). */
export async function processOutbox(limit = 20): Promise<{ sent: number; failed: number; dead: number }> {
  const claimed = await appSql()<{ id: string; tenantId: string }[]>`select * from outbox_claim(${limit})`
  const totals = { sent: 0, failed: 0, dead: 0 }
  for (const claim of claimed) {
    const message = await withTenant(claim.tenantId, async (tx) => {
      const [row] = await tx<ClaimedMessage[]>`
        select id, tenant_id, to_address, subject, body, attachments, attempts from messages where id = ${claim.id}
      `
      return row
    })
    if (!message) continue
    totals[await deliver(message)]++
  }
  return totals
}

export interface MessageRow {
  id: string
  toAddress: string
  subject: string
  body: string
  templateKey: string | null
  status: 'queued' | 'sending' | 'sent' | 'failed' | 'dead'
  attempts: number
  lastError: string | null
  createdAt: Date
  sentAt: Date | null
  nextAttemptAt: Date
  applicationId: string | null
  candidateName: string | null
  hasAttachments: boolean
}

export async function listMessages(ctx: RequestContext, filter: { status?: string; applicationId?: string } = {}): Promise<MessageRow[]> {
  if (!can(ctx.user.role, 'message.view')) throw forbidden()
  return withTenant(ctx.tenantId, (tx) => tx<MessageRow[]>`
    select m.id, m.to_address, m.subject, m.body, m.template_key, m.status, m.attempts, m.last_error, m.created_at, m.sent_at,
      m.next_attempt_at, m.application_id, c.full_name as candidate_name, jsonb_array_length(m.attachments) > 0 as has_attachments
    from messages m left join candidates c on c.id = m.candidate_id
    where true
      ${filter.status ? tx`and m.status = ${filter.status}` : tx``}
      ${filter.applicationId ? tx`and m.application_id = ${filter.applicationId}` : tx``}
    order by m.created_at desc
    limit 200
  `)
}

export async function messageCounts(ctx: RequestContext): Promise<Record<string, number>> {
  const rows = await withTenant(ctx.tenantId, (tx) => tx<{ status: string; count: number }[]>`
    select status, count(*)::int as count from messages group by status
  `)
  return Object.fromEntries(rows.map((row) => [row.status, row.count]))
}

/** Reenvio manual de uma mensagem falhada ou em dead-letter (recuperável, E6). */
export async function retryMessage(ctx: RequestContext, messageId: string): Promise<void> {
  if (!can(ctx.user.role, 'message.send')) throw forbidden()
  await withTenant(ctx.tenantId, async (tx) => {
    const [message] = await tx<{ status: string }[]>`select status from messages where id = ${messageId} for update`
    if (!message) throw notFound('Mensagem')
    if (message.status !== 'failed' && message.status !== 'dead') throw new AppError('CONFLICT', 'Só mensagens falhadas podem ser reenviadas.')
    await tx`update messages set status = 'queued', next_attempt_at = now(), attempts = 0 where id = ${messageId}`
    await recordAudit(tx, actorOf(ctx), { action: 'message.retried', entityType: 'message', entityId: messageId, summary: 'Reenvio manual pedido' })
  })
}

export interface TemplateRow {
  key: TemplateKey
  subject: string
  body: string
  updatedAt: Date
}

export async function listTemplates(ctx: RequestContext): Promise<TemplateRow[]> {
  if (!can(ctx.user.role, 'template.manage')) throw forbidden()
  return withTenant(ctx.tenantId, (tx) => tx<TemplateRow[]>`
    select key, subject, body, updated_at from message_templates where channel = 'email' order by key
  `)
}

const templateSchema = z.object({
  subject: z.string().trim().min(3, 'Assunto demasiado curto').max(200),
  body: z.string().trim().min(10, 'Texto demasiado curto').max(5000),
})

export async function updateTemplate(ctx: RequestContext, key: TemplateKey, input: unknown): Promise<void> {
  if (!can(ctx.user.role, 'template.manage')) throw forbidden()
  const data = parseInput(templateSchema, input)
  await withTenant(ctx.tenantId, async (tx) => {
    const updated = await tx`update message_templates set subject = ${data.subject}, body = ${data.body} where key = ${key} and channel = 'email' returning id`
    if (updated.length === 0) throw notFound('Modelo')
    await recordAudit(tx, actorOf(ctx), { action: 'template.updated', entityType: 'message_template', summary: `Modelo "${TEMPLATE_LABELS[key]}" actualizado` })
  })
}

const customMessageSchema = z.object({
  message: z.string().trim().min(10, 'Escreva a mensagem (mín. 10 caracteres)').max(3000),
})

/** Pedido de informação ao candidato a partir do dossier (modelo "information_request"). */
export async function sendInformationRequest(ctx: RequestContext, applicationId: string, input: unknown): Promise<void> {
  if (!can(ctx.user.role, 'message.send')) throw forbidden()
  const data = parseInput(customMessageSchema, input)
  await withTenant(ctx.tenantId, async (tx) => {
    const [app] = await tx<{ candidateId: string; email: string | null; fullName: string; reference: string; vacancyTitle: string; orgName: string }[]>`
      select a.candidate_id, c.email, c.full_name, a.reference, coalesce(vv.title, 'Candidatura') as vacancy_title, o.name as org_name
      from applications a join candidates c on c.id = a.candidate_id join organizations o on o.id = a.tenant_id
      left join vacancy_versions vv on vv.id = a.vacancy_version_id
      where a.id = ${applicationId}
    `
    if (!app) throw notFound('Candidatura')
    if (!app.email) throw new AppError('VALIDATION', 'O candidato não tem email registado.')
    const [{ count } = { count: 0 }] = await tx<{ count: number }[]>`select count(*)::int as count from messages where application_id = ${applicationId} and template_key = 'information_request'`
    await enqueueTemplateMessage(tx, actorOf(ctx), {
      candidateId: app.candidateId,
      applicationId,
      to: app.email,
      templateKey: 'information_request',
      vars: { candidato: app.fullName.split(' ')[0], vaga: app.vacancyTitle, empresa: app.orgName, referencia: app.reference, mensagem: data.message },
      idempotencyKey: `information_request:${applicationId}:${count + 1}`,
      createdBy: ctx.user.id,
    })
  })
}
