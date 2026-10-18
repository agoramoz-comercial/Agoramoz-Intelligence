import { describe, expect, it, beforeAll } from 'vitest'
import { adminSql } from '@/server/db/client'
import { submitPublicApplication } from '@/modules/applications/intake'
import { getApplicationDetail } from '@/modules/applications/detail'
import { getApplicationInterviews, getScorecardForm, listMyInterviews, saveScorecard, scheduleInterview } from '@/modules/interviews/service'
import { listMessages } from '@/modules/communications/service'
import { utcToZonedLocal } from '@/lib/time'
import { applicant, candidateActor, createTestOrg, intakeTarget, publishedVacancy, type TestOrg } from './helpers'
import type { PublicVacancy } from '@/modules/vacancies/service'

let org: TestOrg
let vacancy: PublicVacancy
let applicationId: string
let interviewId: string

const tomorrow = () => utcToZonedLocal(new Date(Date.now() + 86_400_000))

function scorecard(competencies: { id: string }[], ratings: number[], recommendation: string, intent = 'submit') {
  return {
    intent,
    recommendation,
    ...Object.fromEntries(competencies.flatMap((competency, index) => [
      [`rating_${competency.id}`, String(ratings[index] ?? '')],
      [`evidence_${competency.id}`, 'Exemplo concreto apresentado na entrevista.'],
    ])),
  }
}

beforeAll(async () => {
  org = await createTestOrg('int')
  vacancy = (await publishedVacancy(org)).publicVacancy
  applicationId = (await submitPublicApplication(candidateActor(org.tenantId), intakeTarget(org, vacancy), applicant({}, vacancy), null)).applicationId
  interviewId = await scheduleInterview(org.users.hr, applicationId, {
    startsAt: tomorrow(),
    durationMinutes: 45,
    mode: 'presencial',
    location: 'Escritório da Matola',
    participantIds: [org.users.interviewer.user.id, org.users.manager.user.id],
    notifyCandidate: 'on',
  })
})

describe('entrevistas e scorecards', () => {
  it('envia convite com anexo de calendário .ics', async () => {
    const messages = await listMessages(org.users.hr, { applicationId })
    const invite = messages.find((message) => message.templateKey === 'interview_invitation')
    expect(invite?.hasAttachments).toBe(true)
    const [row] = await adminSql()<{ attachments: { filename: string; content: string }[] }[]>`select attachments from messages where id = ${invite!.id}`
    const ics = Buffer.from(row!.attachments[0]!.content, 'base64').toString()
    expect(ics).toContain('BEGIN:VCALENDAR')
    expect(ics).toContain(`UID:${interviewId}@agoramoz-hr`)
    expect(ics).toContain('METHOD:REQUEST')
  })

  it('recusa entrevistas no passado', async () => {
    await expect(
      scheduleInterview(org.users.hr, applicationId, { startsAt: '2020-01-01T10:00', durationMinutes: 30, mode: 'video', participantIds: [org.users.interviewer.user.id] }),
    ).rejects.toMatchObject({ code: 'VALIDATION' })
  })

  it('o entrevistador vê só as suas entrevistas e sem contactos do candidato', async () => {
    const mine = await listMyInterviews(org.users.interviewer)
    expect(mine.map((item) => item.id)).toContain(interviewId)
    const detail = await getApplicationDetail(org.users.interviewer, applicationId)
    expect(detail.contactHidden).toBe(true)
    expect(detail.candidate.email).toBeNull()
    expect(detail.comments).toHaveLength(0)
  })

  it('o entrevistador não acede a candidaturas onde não participa', async () => {
    const other = await submitPublicApplication(candidateActor(org.tenantId), intakeTarget(org, vacancy), applicant({}, vacancy), null)
    await expect(getApplicationDetail(org.users.interviewer, other.applicationId)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('submeter exige avaliação e evidência em todas as competências; depois fica imutável', async () => {
    const form = await getScorecardForm(org.users.interviewer, interviewId)
    await expect(saveScorecard(org.users.interviewer, interviewId, { intent: 'submit' })).rejects.toMatchObject({ code: 'VALIDATION' })
    await saveScorecard(org.users.interviewer, interviewId, scorecard(form.competencies, [4, 1], 'yes'))
    await expect(saveScorecard(org.users.interviewer, interviewId, scorecard(form.competencies, [1, 1], 'no'))).rejects.toMatchObject({ code: 'CONFLICT' })
  })

  it('quem ainda não submeteu não vê o feedback dos outros; depois vê a consolidação com discordâncias', async () => {
    const before = await getApplicationInterviews(org.users.manager, applicationId)
    expect(before.feedbackHidden).toBe(true)
    const form = await getScorecardForm(org.users.manager, interviewId)
    await saveScorecard(org.users.manager, interviewId, scorecard(form.competencies, [2, 4], 'no'))
    const after = await getApplicationInterviews(org.users.manager, applicationId)
    expect(after.feedbackHidden).toBe(false)
    expect(after.consolidation?.submitted).toBe(2)
    expect(after.consolidation?.recommendationSplit).toBe(true)
    expect(after.consolidation?.competencies.every((item) => item.disagreement)).toBe(true)
  })
})
