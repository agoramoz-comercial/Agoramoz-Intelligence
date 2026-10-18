import { describe, expect, it, beforeAll } from 'vitest'
import { adminSql, withTenant } from '@/server/db/client'
import { searchAudit, exportAuditCsv } from '@/modules/audit/service'
import { createTestOrg, publishedVacancy, type TestOrg } from './helpers'

let org: TestOrg

beforeAll(async () => {
  org = await createTestOrg('audit')
  await publishedVacancy(org)
})

describe('auditoria só-de-acréscimo', () => {
  it('regista as acções de negócio com actor e correlation ID', async () => {
    const { rows } = await searchAudit(org.admin, { action: 'requisition' })
    expect(rows.map((row) => row.action)).toEqual(expect.arrayContaining(['requisition.created', 'requisition.submitted', 'requisition.step_approved']))
    expect(rows.every((row) => row.correlationId === 'test-correlation-0001')).toBe(true)
  })

  it('o papel da aplicação não pode alterar nem apagar eventos', async () => {
    await expect(withTenant(org.tenantId, (tx) => tx`update audit_events set summary = 'adulterado'`)).rejects.toThrow(/permission denied/)
    await expect(withTenant(org.tenantId, (tx) => tx`delete from audit_events`)).rejects.toThrow(/permission denied/)
  })

  it('nem o owner da base de dados altera eventos (trigger)', async () => {
    await expect(adminSql()`update audit_events set summary = 'adulterado' where tenant_id = ${org.tenantId}`).rejects.toThrow(/imutável/)
    await expect(adminSql()`truncate audit_events`).rejects.toThrow(/imutável/)
  })

  it('as versões publicadas de vagas são imutáveis', async () => {
    await expect(adminSql()`update vacancy_versions set title = 'outro' where tenant_id = ${org.tenantId}`).rejects.toThrow(/imutável/)
  })

  it('a exportação exige permissão e fica ela própria auditada', async () => {
    await expect(exportAuditCsv(org.users.hr, {})).rejects.toMatchObject({ code: 'FORBIDDEN' })
    const csv = await exportAuditCsv(org.admin, {})
    expect(csv.split('\r\n')[0]).toContain('accao')
    const { rows } = await searchAudit(org.admin, { action: 'audit' })
    expect(rows[0]?.action).toBe('audit.exported')
  })
})
