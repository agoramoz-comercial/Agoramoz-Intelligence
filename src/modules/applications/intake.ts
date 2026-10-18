import { z } from 'zod'
import { withTenant, type Tx } from '@/server/db/client'
import { recordAudit } from '@/server/audit/audit'
import type { ActorContext } from '@/server/context'
import { AppError } from '@/server/errors'
import { parseInput } from '@/server/validation'
import { candidateReference } from '@/server/auth/tokens'
import { env } from '@/server/env'
import { newStorageKey, storage } from '@/server/storage/storage'
import { scanUpload, safeFilename, MIME_BY_TYPE } from '@/server/files/scan'
import { extractText } from '@/server/files/extract'
import { createHash } from 'node:crypto'
import { normalizePhone } from '@/lib/text'
import { addMonths } from '@/lib/time'
import { analyzeEvidence } from '@/modules/evidence/engine'
import { findDuplicates, recordDuplicateSuggestions } from '@/modules/candidates/duplicates'
import { enqueueTemplateMessage } from '@/modules/communications/service'
import { loadSettings, type OrgSettings } from '@/modules/organizations/settings'
import type { Requirement } from '@/modules/requisitions/schema'
import type { ScreeningQuestion } from '@/modules/vacancies/schema'

export const APPLICATION_SOURCES = ['careers_page', 'email', 'whatsapp', 'import', 'referral', 'manual', 'spontaneous'] as const
export type ApplicationSource = (typeof APPLICATION_SOURCES)[number]

export const SOURCE_LABELS: Record<ApplicationSource, string> = {
  careers_page: 'Página de carreiras',
  email: 'Email',
  whatsapp: 'WhatsApp',
  import: 'Importação',
  referral: 'Referência interna',
  manual: 'Registo manual',
  spontaneous: 'Espontânea',
}

export const candidateFieldsSchema = z
  .object({
    fullName: z.string().trim().min(3, 'Indique o nome completo').max(120, 'Nome demasiado longo'),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .max(200)
      .nullish()
      .transform((value) => value || null)
      .refine((value) => value === null || z.string().email().safeParse(value).success, 'Email inválido'),
    phone: z
      .string()
      .trim()
      .max(30)
      .nullish()
      .transform((value) => (value ? normalizePhone(value) ?? 'invalid' : null))
      .refine((value) => value !== 'invalid', 'Telefone inválido. Ex.: 84 123 4567 ou +258 84 123 4567'),
    location: z.string().trim().max(120).nullish().transform((value) => value || null),
  })
  .refine((data) => data.email !== null || data.phone !== null, {
    message: 'Indique um email ou um telefone para podermos responder',
    path: ['email'],
  })

export const publicApplicationSchema = candidateFieldsSchema.and(
  z.object({
    consent: z.literal(true, { message: 'É necessário aceitar o tratamento dos dados para esta candidatura' }),
    consentTalentPool: z.boolean().default(false),
    consentWhatsapp: z.boolean().default(false),
    coverNote: z.string().trim().max(2000).nullish().transform((value) => value || null),
    answers: z.array(z.object({ questionId: z.string().max(20), answer: z.string().max(1000) })).max(10).default([]),
  }),
)

export type PublicApplicationInput = z.infer<typeof publicApplicationSchema>

export interface UploadedFile {
  name: string
  data: Uint8Array
}

interface PreparedFile {
  filename: string
  mime: string
  size: number
  sha256: string
  storageKey: string
  text: string | null
}

export interface IntakeTarget {
  orgSlug: string
  orgName: string
  vacancy: {
    vacancyId: string
    versionId: string
    title: string
    requirements: Requirement[]
    screeningQuestions: ScreeningQuestion[]
  } | null
}

export interface IntakeResult {
  reference: string
  applicationId: string
  candidateId: string
  alreadyApplied: boolean
}

/** Verifica e guarda o ficheiro fora da transacção (operação lenta); devolve metadados para o registo. */
async function prepareFile(tenantId: string, file: UploadedFile | null): Promise<PreparedFile | null> {
  if (!file || file.data.length === 0) return null
  const scan = scanUpload(file.data)
  if (scan.status !== 'clean' || !scan.type) {
    const message = scan.status === 'infected' ? `O ficheiro foi bloqueado pela verificação de segurança: ${scan.detail}` : scan.detail
    throw new AppError('VALIDATION', message, { cv: message })
  }
  const storageKey = newStorageKey(tenantId)
  await storage().put(storageKey, file.data)
  return {
    filename: safeFilename(file.name, scan.type),
    mime: MIME_BY_TYPE[scan.type],
    size: file.data.length,
    sha256: createHash('sha256').update(file.data).digest('hex'),
    storageKey,
    text: await extractText(file.data, scan.type),
  }
}

export function retentionUntil(settings: OrgSettings, talentPool: boolean, from = new Date()): string {
  return addMonths(from, talentPool ? settings.talentPoolMonths : settings.retentionMonths).toISOString().slice(0, 10)
}

export function privacyLink(orgSlug: string): string {
  return `${env().APP_URL}/carreiras/${orgSlug}/privacidade`
}

async function firstStageId(tx: Tx, vacancyId: string): Promise<string> {
  const [stage] = await tx<{ id: string }[]>`select id from pipeline_stages where vacancy_id = ${vacancyId} order by position limit 1`
  if (!stage) throw new Error('Vaga sem etapas')
  return stage.id
}

interface IntakeRecord {
  candidate: { fullName: string; email: string | null; phone: string | null; location: string | null }
  consentTalentPool: boolean
  consentWhatsapp: boolean
  consentRecordedAt: Date
  coverNote: string | null
  answers: { questionId: string; answer: string }[]
  source: ApplicationSource
  ownerId?: string | null
  notifyCandidate: boolean
}

/**
 * Regista candidato + candidatura numa só transacção: ficheiro, evidência, duplicados, confirmação e auditoria.
 * Usado pela página pública, pelo registo manual de RH (email/WhatsApp) e pela importação.
 */
export async function intakeApplication(
  actor: ActorContext,
  target: IntakeTarget,
  record: IntakeRecord,
  file: UploadedFile | null,
): Promise<IntakeResult> {
  const prepared = await prepareFile(actor.tenantId, file)
  try {
    return await withTenant(actor.tenantId, async (tx) => {
      const settings = await loadSettings(tx, actor.tenantId)
      if (target.vacancy && record.candidate.email) {
        const [existing] = await tx<{ reference: string; applicationId: string; candidateId: string }[]>`
          select a.reference, a.id as application_id, a.candidate_id
          from applications a join candidates c on c.id = a.candidate_id
          where a.vacancy_id = ${target.vacancy.vacancyId} and c.email = ${record.candidate.email}::citext and c.anonymized_at is null
          limit 1
        `
        if (existing) {
          if (prepared) await storage().remove(prepared.storageKey)
          return { ...existing, alreadyApplied: true }
        }
      }

      const [candidate] = await tx<{ id: string }[]>`
        insert into candidates (
          tenant_id, full_name, email, phone, location, source, consent_processing_at, consent_version,
          consent_talent_pool, consent_whatsapp, retention_until
        ) values (
          ${actor.tenantId}, ${record.candidate.fullName}, ${record.candidate.email}, ${record.candidate.phone}, ${record.candidate.location},
          ${record.source}, ${record.consentRecordedAt}, ${settings.consentVersion}, ${record.consentTalentPool}, ${record.consentWhatsapp},
          ${retentionUntil(settings, record.consentTalentPool)}
        ) returning id
      `
      if (!candidate) throw new Error('insert falhou')

      const reference = candidateReference()
      const evidence = target.vacancy
        ? analyzeEvidence({
            requirements: target.vacancy.requirements,
            cvText: prepared?.text ?? null,
            questions: target.vacancy.screeningQuestions,
            answers: record.answers,
          })
        : null
      const [application] = await tx<{ id: string }[]>`
        insert into applications (
          tenant_id, candidate_id, vacancy_id, vacancy_version_id, stage_id, reference, source, owner_id, answers, cover_note, evidence
        ) values (
          ${actor.tenantId}, ${candidate.id}, ${target.vacancy?.vacancyId ?? null}, ${target.vacancy?.versionId ?? null},
          ${target.vacancy ? await firstStageId(tx, target.vacancy.vacancyId) : null}, ${reference},
          ${record.source}, ${record.ownerId ?? null}, ${tx.json(record.answers as never)},
          ${record.coverNote}, ${evidence ? tx.json(evidence as never) : null}
        ) returning id
      `
      if (!application) throw new Error('insert falhou')

      if (prepared) {
        await tx`
          insert into candidate_files (tenant_id, candidate_id, application_id, kind, filename, mime, size_bytes, sha256, storage_key, scan_status, scan_detail, text_content)
          values (${actor.tenantId}, ${candidate.id}, ${application.id}, 'cv', ${prepared.filename}, ${prepared.mime}, ${prepared.size},
            ${prepared.sha256}, ${prepared.storageKey}, 'clean', 'Verificação estática sem ocorrências', ${prepared.text})
        `
      }

      const duplicates = await findDuplicates(tx, { id: candidate.id, ...record.candidate })
      const duplicateCount = await recordDuplicateSuggestions(tx, actor.tenantId, candidate.id, duplicates)

      if (record.notifyCandidate && record.candidate.email) {
        await enqueueTemplateMessage(tx, actor, {
          candidateId: candidate.id,
          applicationId: application.id,
          to: record.candidate.email,
          templateKey: 'application_received',
          vars: {
            candidato: record.candidate.fullName.split(' ')[0],
            vaga: target.vacancy?.title ?? 'candidatura espontânea',
            empresa: target.orgName,
            referencia: reference,
            link: privacyLink(target.orgSlug),
          },
          idempotencyKey: `application_received:${application.id}`,
        })
      }

      await recordAudit(tx, actor, {
        action: 'application.submitted',
        entityType: 'application',
        entityId: application.id,
        summary: target.vacancy ? `Candidatura recebida (${SOURCE_LABELS[record.source]})` : 'Candidatura espontânea recebida',
        changes: {
          source: record.source,
          vacancyId: target.vacancy?.vacancyId ?? null,
          hasCv: Boolean(prepared),
          cvTextExtracted: Boolean(prepared?.text),
          evidence: evidence ? `${evidence.mustFound}/${evidence.mustTotal}` : null,
          duplicateSuggestions: duplicateCount,
          consentTalentPool: record.consentTalentPool,
          consentWhatsapp: record.consentWhatsapp,
        },
      })
      return { reference, applicationId: application.id, candidateId: candidate.id, alreadyApplied: false }
    })
  } catch (error: unknown) {
    if (prepared) await storage().remove(prepared.storageKey).catch(() => undefined)
    throw error
  }
}

/** Entrada pública: valida a fronteira e regista com o candidato como actor. */
export async function submitPublicApplication(
  actor: ActorContext,
  target: IntakeTarget,
  input: unknown,
  file: UploadedFile | null,
): Promise<IntakeResult> {
  const data = parseInput(publicApplicationSchema, input)
  const questions = target.vacancy?.screeningQuestions ?? []
  const missing = questions.filter((question) => question.required && !data.answers.some((answer) => answer.questionId === question.id && answer.answer.trim()))
  if (missing.length > 0) {
    throw new AppError('VALIDATION', 'Responda às perguntas obrigatórias.', Object.fromEntries(missing.map((question) => [`answer_${question.id}`, 'Resposta obrigatória'])))
  }
  const validIds = new Set(questions.map((question) => question.id))
  return intakeApplication(
    actor,
    target,
    {
      candidate: { fullName: data.fullName, email: data.email, phone: data.phone, location: data.location },
      consentTalentPool: data.consentTalentPool,
      consentWhatsapp: data.consentWhatsapp,
      consentRecordedAt: new Date(),
      coverNote: data.coverNote,
      answers: data.answers.filter((answer) => validIds.has(answer.questionId)),
      source: 'careers_page',
      notifyCandidate: true,
    },
    file,
  )
}
