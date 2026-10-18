import { describe, expect, it, beforeAll } from 'vitest'
import { unzipSync, strFromU8 } from 'fflate'
import { textPdf } from '../../scripts/lib/pdf'
import { adminSql } from '@/server/db/client'
import { submitPublicApplication } from '@/modules/applications/intake'
import { rejectApplication } from '@/modules/applications/pipeline'
import { getCandidate } from '@/modules/candidates/service'
import { createPublicDsr, eraseCandidate, exportCandidateData, exportOrganization, listDsrs, resolveDsr, runRetention, verifyDsr } from '@/modules/privacy/service'
import { applicant, candidateActor, createTestOrg, intakeTarget, publishedVacancy, type TestOrg } from './helpers'
import type { PublicVacancy } from '@/modules/vacancies/service'

let org: TestOrg
let vacancy: PublicVacancy

beforeAll(async () => {
  org = await createTestOrg('priv')
  vacancy = (await publishedVacancy(org)).publicVacancy
})

describe('privacidade, direitos do titular e retenção', () => {
  it('pedido público → confirmação por token → resolução fundamentada', async () => {
    const person = applicant({}, vacancy)
    await submitPublicApplication(candidateActor(org.tenantId), intakeTarget(org, vacancy), person, null)
    await createPublicDsr(candidateActor(org.tenantId), { slug: org.slug, name: org.name }, { email: person.email, kind: 'access' })
    const [message] = await adminSql()<{ body: string }[]>`select body from messages where tenant_id = ${org.tenantId} and template_key = 'dsr_verification' order by created_at desc limit 1`
    const token = /token=([A-Za-z0-9_-]+)/.exec(message!.body)?.[1]
    expect(token).toBeTruthy()
    expect(await verifyDsr(candidateActor(org.tenantId), 'token-falso')).toBeNull()
    expect(await verifyDsr(candidateActor(org.tenantId), token!)).toEqual({ kind: 'access' })
    expect(await verifyDsr(candidateActor(org.tenantId), token!)).toBeNull()
    const [request] = (await listDsrs(org.users.privacy)).filter((item) => item.email === person.email)
    expect(request?.status).toBe('open')
    expect(request?.candidateId).toBeTruthy()
    await resolveDsr(org.users.privacy, request!.id, { outcome: 'completed', resolution: 'Dados exportados e enviados ao titular.' })
    await expect(listDsrs(org.users.hr)).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('anonimização apaga identificação, conteúdos livres e ficheiros; exige processo encerrado', async () => {
    const app = await submitPublicApplication(candidateActor(org.tenantId), intakeTarget(org, vacancy), applicant({ coverNote: 'Nota pessoal' }, vacancy), { name: 'cv.pdf', data: textPdf(['Carta de conducao profissional']) })
    await expect(eraseCandidate(org.users.privacy, app.candidateId, 'Pedido do titular de teste')).rejects.toMatchObject({ code: 'CONFLICT' })
    await rejectApplication(org.users.hr, app.applicationId, { reason: 'desistencia', notify: '' })
    const exported = await exportCandidateData(org.users.privacy, app.candidateId)
    expect(JSON.parse(exported.json).candidaturas).toHaveLength(1)
    await eraseCandidate(org.users.privacy, app.candidateId, 'Pedido do titular de teste')
    const profile = await getCandidate(org.users.privacy, app.candidateId)
    expect(profile.candidate).toMatchObject({ fullName: 'Candidato anonimizado', email: null, phone: null })
    expect(profile.files).toHaveLength(0)
    const [row] = await adminSql()<{ coverNote: string | null }[]>`select cover_note from applications where id = ${app.applicationId}`
    expect(row?.coverNote).toBeNull()
  })

  it('retenção: a simulação não altera nada; a execução anonimiza os expirados', async () => {
    const app = await submitPublicApplication(candidateActor(org.tenantId), intakeTarget(org, vacancy), applicant({}, vacancy), null)
    await rejectApplication(org.users.hr, app.applicationId, { reason: 'outro_candidato', notify: '' })
    await adminSql()`update candidates set retention_until = current_date - 1 where id = ${app.candidateId}`
    const preview = await runRetention(org.users.privacy, true)
    expect(preview.candidates.map((item) => item.id)).toContain(app.candidateId)
    expect((await getCandidate(org.users.privacy, app.candidateId)).candidate.anonymizedAt).toBeNull()
    await runRetention(org.users.privacy, false)
    expect((await getCandidate(org.users.privacy, app.candidateId)).candidate.anonymizedAt).not.toBeNull()
  })

  it('exportação completa da organização em ZIP legível (portabilidade)', async () => {
    const { zip } = await exportOrganization(org.admin)
    const files = unzipSync(zip)
    expect(Object.keys(files)).toEqual(expect.arrayContaining(['LEIA-ME.txt', 'candidatos.csv', 'candidaturas.csv', 'auditoria.csv']))
    expect(strFromU8(files['candidaturas.csv']!)).toContain('reference')
    await expect(exportOrganization(org.users.hr)).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })
})
