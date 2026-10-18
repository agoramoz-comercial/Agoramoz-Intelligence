import { describe, expect, it, beforeAll } from 'vitest'
import { adminSql, appSql, withTenant } from '@/server/db/client'
import { submitPublicApplication } from '@/modules/applications/intake'
import { getApplicationDetail } from '@/modules/applications/detail'
import { searchCandidates } from '@/modules/candidates/service'
import { getPublicOrg } from '@/modules/organizations/public'
import { applicant, candidateActor, createTestOrg, intakeTarget, publishedVacancy, type TestOrg } from './helpers'

let a: TestOrg
let b: TestOrg
let appInB: string
let vacancyInB: string

beforeAll(async () => {
  a = await createTestOrg('tenant-a')
  b = await createTestOrg('tenant-b')
  const { publicVacancy } = await publishedVacancy(b)
  vacancyInB = publicVacancy.vacancyId
  const result = await submitPublicApplication(candidateActor(b.tenantId), intakeTarget(b, publicVacancy), applicant({ fullName: 'Pessoa Do Tenant B' }, publicVacancy), null)
  appInB = result.applicationId
})

describe('isolamento entre empresas (RLS + chaves compostas)', () => {
  it('sem tenant definido, a aplicação não vê nenhuma linha (fail closed)', async () => {
    const rows = await appSql()`select id from candidates`
    expect(rows).toHaveLength(0)
  })

  it('com o tenant A, uma consulta sem WHERE só devolve dados de A', async () => {
    const rows = await withTenant(a.tenantId, (tx) => tx<{ tenantId: string }[]>`select tenant_id from users`)
    expect(rows.length).toBeGreaterThan(0)
    expect(new Set(rows.map((row) => row.tenantId))).toEqual(new Set([a.tenantId]))
  })

  it('recusa inserir linhas de outro tenant (WITH CHECK)', async () => {
    await expect(
      withTenant(a.tenantId, (tx) => tx`
        insert into departments (tenant_id, name) values (${b.tenantId}, 'Infiltrado')
      `),
    ).rejects.toThrow(/row-level security/)
  })

  it('recusa referenciar uma vaga de outro tenant mesmo conhecendo o UUID', async () => {
    await expect(
      withTenant(a.tenantId, async (tx) => {
        const [candidate] = await tx<{ id: string }[]>`
          insert into candidates (tenant_id, full_name, consent_processing_at, consent_version)
          values (${a.tenantId}, 'Teste FK', now(), 'v') returning id
        `
        await tx`
          insert into applications (tenant_id, candidate_id, vacancy_id, reference, source)
          values (${a.tenantId}, ${candidate!.id}, ${vacancyInB}, 'AGH-CROSS1', 'manual')
        `
      }),
    ).rejects.toThrow(/foreign key/)
  })

  it('serviços devolvem "não encontrado" para IDs de outro tenant', async () => {
    await expect(getApplicationDetail(a.users.hr, appInB)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('a pesquisa de candidatos de A não encontra pessoas de B', async () => {
    const result = await searchCandidates(a.users.hr, { q: 'Pessoa Do Tenant B' })
    expect(result.total).toBe(0)
  })

  it('a função pública por slug só expõe campos públicos', async () => {
    const org = await getPublicOrg(b.slug)
    expect(org).toEqual({ id: b.tenantId, slug: b.slug, name: b.name, sector: null })
    expect(await getPublicOrg('../etc')).toBeNull()
  })

  it('o papel da aplicação não é superuser nem ignora RLS', async () => {
    const [role] = await adminSql()<{ rolsuper: boolean; rolbypassrls: boolean }[]>`select rolsuper, rolbypassrls from pg_roles where rolname = 'agoramoz_app'`
    expect(role).toEqual({ rolsuper: false, rolbypassrls: false })
  })
})
