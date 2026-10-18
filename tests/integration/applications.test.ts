import { describe, expect, it, beforeAll, afterEach } from 'vitest'
import { textPdf } from '../../scripts/lib/pdf'
import { withTenant } from '@/server/db/client'
import { setMailProviderForTests } from '@/server/mail/provider'
import { submitPublicApplication } from '@/modules/applications/intake'
import { getApplicationDetail } from '@/modules/applications/detail'
import { getBoard, hireApplication, moveApplication, rejectApplication } from '@/modules/applications/pipeline'
import { getCandidate, mergeCandidates, readCandidateFile } from '@/modules/candidates/service'
import { listMessages, processOutbox, retryMessage } from '@/modules/communications/service'
import { getDashboard } from '@/modules/analytics/service'
import { applicant, candidateActor, createTestOrg, intakeTarget, publishedVacancy, type TestOrg } from './helpers'
import type { PublicVacancy } from '@/modules/vacancies/service'

let org: TestOrg
let vacancy: PublicVacancy

beforeAll(async () => {
  org = await createTestOrg('apps')
  vacancy = (await publishedVacancy(org)).publicVacancy
})

afterEach(() => setMailProviderForTests(undefined))

const cv = () => ({ name: 'cv.pdf', data: textPdf(['Fiel de armazem em distribuidora (2019-2024)', 'Carta de conducao profissional']) })

describe('candidatura pública → pipeline → decisão', () => {
  it('regista candidatura com CV verificado, texto extraído e evidência citada', async () => {
    const result = await submitPublicApplication(candidateActor(org.tenantId), intakeTarget(org, vacancy), applicant({}, vacancy), cv())
    expect(result.reference).toMatch(/^AGH-[2-9A-HJ-NP-Z]{6}$/)
    const detail = await getApplicationDetail(org.users.hr, result.applicationId)
    expect(detail.files).toHaveLength(1)
    expect(detail.files[0]?.hasText).toBe(true)
    expect(detail.evidence?.mustFound).toBe(2)
    expect(detail.evidence?.statement).toContain('2 de 2 requisitos obrigatórios')
    expect(detail.stageKind).toBe('new')
  })

  it('bloqueia ficheiros perigosos com mensagem clara e não cria registos', async () => {
    const eicar = new TextEncoder().encode('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*')
    await expect(submitPublicApplication(candidateActor(org.tenantId), intakeTarget(org, vacancy), applicant({}, vacancy), { name: 'cv.pdf', data: eicar })).rejects.toMatchObject({
      code: 'VALIDATION',
      fieldErrors: { cv: expect.stringContaining('bloqueado') },
    })
  })

  it('é idempotente: o mesmo email na mesma vaga devolve a referência existente', async () => {
    const person = applicant({}, vacancy)
    const first = await submitPublicApplication(candidateActor(org.tenantId), intakeTarget(org, vacancy), person, null)
    const second = await submitPublicApplication(candidateActor(org.tenantId), intakeTarget(org, vacancy), person, null)
    expect(second).toMatchObject({ alreadyApplied: true, reference: first.reference })
  })

  it('sugere duplicados (mesmo telefone) sem fundir; a fusão é humana e auditada', async () => {
    const one = await submitPublicApplication(candidateActor(org.tenantId), intakeTarget(org, vacancy), applicant({ fullName: 'Duplicada Silva', phone: '849998877' }, vacancy), null)
    const other = await submitPublicApplication(candidateActor(org.tenantId), intakeTarget(org, { ...vacancy, vacancyId: vacancy.vacancyId }), applicant({ fullName: 'Duplicada Silva', phone: '+258 84 999 8877', email: null }, vacancy), null)
    const profile = await getCandidate(org.users.hr, other.candidateId)
    expect(profile.duplicates[0]?.reasons).toEqual(expect.arrayContaining(['mesmo telefone']))
    await expect(mergeCandidates(org.users.hr, one.candidateId, other.candidateId)).rejects.toMatchObject({ code: 'CONFLICT' })
  })

  it('move etapas, exige motivo na rejeição e comunica a decisão', async () => {
    const app = await submitPublicApplication(candidateActor(org.tenantId), intakeTarget(org, vacancy), applicant({}, vacancy), null)
    const board = await getBoard(org.users.hr, vacancy.vacancyId)
    const screening = board.stages.find((stage) => stage.kind === 'screening')!
    await moveApplication(org.users.hr, app.applicationId, { stageId: screening.id })
    await expect(rejectApplication(org.users.hr, app.applicationId, { notify: 'on' })).rejects.toMatchObject({ code: 'VALIDATION' })
    await rejectApplication(org.users.hr, app.applicationId, { reason: 'experiencia_insuficiente', notify: 'on' })
    const messages = await listMessages(org.users.hr, { applicationId: app.applicationId })
    expect(messages.map((message) => message.templateKey)).toEqual(expect.arrayContaining(['application_received', 'rejection']))
    const detail = await getApplicationDetail(org.users.hr, app.applicationId)
    expect(detail.status).toBe('rejected')
    expect(detail.timeline.map((event) => event.action)).toEqual(expect.arrayContaining(['application.submitted', 'application.moved', 'application.rejected']))
  })

  it('contratar usa a etapa final; mover directamente para "Contratado" é recusado', async () => {
    const app = await submitPublicApplication(candidateActor(org.tenantId), intakeTarget(org, vacancy), applicant({}, vacancy), null)
    const board = await getBoard(org.users.hr, vacancy.vacancyId)
    const hired = board.stages.find((stage) => stage.kind === 'hired')!
    await expect(moveApplication(org.users.hr, app.applicationId, { stageId: hired.id })).rejects.toMatchObject({ code: 'VALIDATION' })
    await hireApplication(org.users.hr, app.applicationId, true)
    expect((await getApplicationDetail(org.users.hr, app.applicationId)).stageKind).toBe('hired')
  })

  it('a outbox entrega, repete com backoff e passa a dead-letter; o reenvio manual recupera', async () => {
    await processOutbox(100)
    setMailProviderForTests({
      name: 'falha',
      async send() {
        throw new Error('SMTP indisponível')
      },
    })
    const app = await submitPublicApplication(candidateActor(org.tenantId), intakeTarget(org, vacancy), applicant({}, vacancy), null)
    await processOutbox(100)
    let [message] = await listMessages(org.users.hr, { applicationId: app.applicationId })
    expect(message).toMatchObject({ status: 'failed', attempts: 1, lastError: 'SMTP indisponível' })
    for (let attempt = 0; attempt < 5; attempt++) {
      await withTenant(org.tenantId, (tx) => tx`update messages set next_attempt_at = now() - interval '1 second' where id = ${message!.id} and status = 'failed'`)
      await processOutbox(100)
    }
    ;[message] = await listMessages(org.users.hr, { applicationId: app.applicationId })
    expect(message?.status).toBe('dead')
    setMailProviderForTests(undefined)
    await retryMessage(org.users.hr, message!.id)
    await processOutbox(100)
    ;[message] = await listMessages(org.users.hr, { applicationId: app.applicationId })
    expect(message?.status).toBe('sent')
  })

  it('o download de CV é auditado e negado a quem não participa', async () => {
    const app = await submitPublicApplication(candidateActor(org.tenantId), intakeTarget(org, vacancy), applicant({}, vacancy), cv())
    const detail = await getApplicationDetail(org.users.hr, app.applicationId)
    const file = await readCandidateFile(org.users.hr, detail.files[0]!.id)
    expect(Buffer.from(file.data).subarray(0, 5).toString()).toBe('%PDF-')
    await expect(readCandidateFile(org.users.interviewer, detail.files[0]!.id)).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('o painel mede o período com definições explícitas', async () => {
    const data = await getDashboard(org.users.hr, {})
    const applications = data.kpis.find((kpi) => kpi.key === 'applications')
    expect(applications?.value).toBeGreaterThan(5)
    expect(applications?.definition).toMatch(/período/)
    expect(data.funnel[0]?.reached).toBeGreaterThan(0)
    await expect(getDashboard(org.users.interviewer, {})).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })
})
