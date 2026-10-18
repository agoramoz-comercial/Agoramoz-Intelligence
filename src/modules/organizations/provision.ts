import type { Sql } from '@/server/db/client'
import { hashPassword, passwordPolicyError } from '@/server/auth/password'
import { DEFAULT_TEMPLATES, type TemplateKey } from '@/modules/communications/defaults'
import { orgSettingsSchema, type OrgSettings } from './settings'

export interface ProvisionInput {
  slug: string
  name: string
  sector?: string
  admin: { email: string; fullName: string; password: string }
  departments?: string[]
  settings?: Partial<OrgSettings>
}

const DEFAULT_DEPARTMENTS = ['Recursos Humanos', 'Operações', 'Administração e Finanças']

/**
 * Provisiona uma organização-cliente (acção de plataforma, executada pela AGORAMOZ com a ligação admin):
 * organização, departamentos, matriz de aprovação, modelos de mensagem e o primeiro administrador.
 */
export async function provisionOrganization(admin: Sql, input: ProvisionInput): Promise<{ tenantId: string; adminId: string }> {
  const policy = passwordPolicyError(input.admin.password)
  if (policy) throw new Error(policy)
  const passwordHash = await hashPassword(input.admin.password)
  const settings = orgSettingsSchema.parse(input.settings ?? {})

  const result = await admin.begin(async (tx) => {
    const [org] = await tx<{ id: string }[]>`
      insert into organizations (slug, name, sector, settings)
      values (${input.slug}, ${input.name}, ${input.sector ?? null}, ${tx.json(settings)})
      returning id
    `
    if (!org) throw new Error('Falha ao criar organização')
    for (const name of input.departments ?? DEFAULT_DEPARTMENTS) {
      await tx`insert into departments (tenant_id, name) values (${org.id}, ${name})`
    }
    await tx`
      insert into approval_steps (tenant_id, position, role, label, min_salary_max) values
        (${org.id}, 1, 'hiring_manager', 'Validação do gestor da área', null),
        (${org.id}, 2, 'hr', 'Validação de Recursos Humanos', null),
        (${org.id}, 3, 'executive', 'Aprovação da Direcção (orçamento elevado)', 100000)
    `
    for (const [key, template] of Object.entries(DEFAULT_TEMPLATES) as [TemplateKey, { subject: string; body: string }][]) {
      await tx`
        insert into message_templates (tenant_id, key, channel, subject, body)
        values (${org.id}, ${key}, 'email', ${template.subject}, ${template.body})
      `
    }
    const [user] = await tx<{ id: string }[]>`
      insert into users (tenant_id, email, full_name, role, password_hash)
      values (${org.id}, ${input.admin.email.toLowerCase()}, ${input.admin.fullName}, 'org_admin', ${passwordHash})
      returning id
    `
    if (!user) throw new Error('Falha ao criar administrador')
    await tx`
      insert into audit_events (tenant_id, actor_type, action, entity_type, entity_id, summary)
      values (${org.id}, 'system', 'org.provisioned', 'organization', ${org.id}, 'Organização provisionada pela plataforma')
    `
    return { tenantId: org.id, adminId: user.id }
  })
  return result as { tenantId: string; adminId: string }
}
