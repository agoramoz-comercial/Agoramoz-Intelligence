import { describe, expect, it, beforeAll } from 'vitest'
import { importCandidates } from '@/modules/candidates/import'
import { login, logout, resolveSession } from '@/server/auth/session'
import { searchCandidates } from '@/modules/candidates/service'
import { createTestOrg, publishedVacancy, PASSWORD, type TestOrg } from './helpers'

let org: TestOrg
let vacancyId: string
const meta = { ip: '127.0.0.1', userAgent: 'vitest', correlationId: 'test-auth-0001' }

beforeAll(async () => {
  org = await createTestOrg('imp')
  vacancyId = (await publishedVacancy(org)).vacancyId
})

const CSV = `Nome;Email;Telefone;Localidade;Origem
Ana Mucavele;ana.m@exemplo.test;84 111 2233;Maputo;WhatsApp
;sem.nome@exemplo.test;;;
Bruno Tivane;email-invalido;;Beira;email
Carla Nhabinde;carla@exemplo.test;+258 82 444 5566;Matola;feira de emprego`

describe('importação de folha de cálculo', () => {
  it('valida sem gravar e devolve erros por linha', async () => {
    const report = await importCandidates(org.users.hr, { csvText: CSV, vacancyId, dryRun: true, consentConfirmed: false })
    expect(report).toMatchObject({ dryRun: true, totalRows: 4, valid: 2, invalid: 2, imported: 0 })
    expect(report.rows.find((row) => row.line === 3)?.errors).toContain('Indique o nome completo')
    expect(report.rows.find((row) => row.line === 5)?.warnings[0]).toMatch(/desconhecida/)
    expect((await searchCandidates(org.users.hr, { q: 'Mucavele' })).total).toBe(0)
  })

  it('importa só as linhas válidas e exige confirmação da base de tratamento', async () => {
    await expect(importCandidates(org.users.hr, { csvText: CSV, vacancyId, dryRun: false, consentConfirmed: false })).rejects.toMatchObject({ code: 'VALIDATION' })
    const report = await importCandidates(org.users.hr, { csvText: CSV, vacancyId, dryRun: false, consentConfirmed: true })
    expect(report.imported).toBe(2)
    expect((await searchCandidates(org.users.hr, { q: 'Mucavele' })).total).toBe(1)
  })

  it('aponta as colunas em falta', async () => {
    await expect(importCandidates(org.users.hr, { csvText: 'Cidade\nMaputo', vacancyId: null, dryRun: true, consentConfirmed: false })).rejects.toMatchObject({ code: 'VALIDATION' })
  })
})

describe('autenticação e sessões', () => {
  it('inicia sessão, resolve o utilizador e termina a sessão', async () => {
    const email = `hr-${org.slug.split('-').pop()}@teste.test`
    const session = await login(email, PASSWORD, meta)
    expect(session.user.role).toBe('hr')
    expect((await resolveSession(session.token))?.id).toBe(session.user.id)
    await logout(session.token, meta)
    expect(await resolveSession(session.token)).toBeNull()
  })

  it('responde igual a emails inexistentes e bloqueia após 5 falhas', async () => {
    await expect(login('ninguem@teste.test', 'qualquer-coisa-12', meta)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' })
    const email = `executive-${org.slug.split('-').pop()}@teste.test`
    for (let attempt = 0; attempt < 5; attempt++) {
      await expect(login(email, 'errada-errada-12', meta)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' })
    }
    await expect(login(email, PASSWORD, meta)).rejects.toMatchObject({ code: 'RATE_LIMITED' })
  })

  it('tokens forjados ou longos nunca resolvem', async () => {
    expect(await resolveSession('x'.repeat(200))).toBeNull()
    expect(await resolveSession('token-inventado')).toBeNull()
  })
})
