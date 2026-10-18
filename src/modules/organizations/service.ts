import { withTenant } from '@/server/db/client'
import { recordAudit } from '@/server/audit/audit'
import { actorOf, type RequestContext } from '@/server/context'
import { forbidden } from '@/server/errors'
import { can } from '@/server/auth/rbac'
import { parseInput } from '@/server/validation'
import { loadSettings, orgSettingsSchema, settingsFormSchema, type OrgSettings } from './settings'

export async function getSettings(ctx: RequestContext): Promise<OrgSettings & { name: string; slug: string }> {
  return withTenant(ctx.tenantId, async (tx) => {
    const [org] = await tx<{ name: string; slug: string }[]>`select name, slug from organizations where id = ${ctx.tenantId}`
    return { ...(await loadSettings(tx, ctx.tenantId)), name: org?.name ?? '', slug: org?.slug ?? '' }
  })
}

export async function updateSettings(ctx: RequestContext, input: unknown): Promise<void> {
  if (!can(ctx.user.role, 'org.manage')) throw forbidden()
  const data = parseInput(settingsFormSchema, input)
  await withTenant(ctx.tenantId, async (tx) => {
    const current = await loadSettings(tx, ctx.tenantId)
    const next = orgSettingsSchema.parse({ ...current, ...data })
    await tx`update organizations set settings = ${tx.json(next)} where id = ${ctx.tenantId}`
    await recordAudit(tx, actorOf(ctx), {
      action: 'org.settings_updated',
      entityType: 'organization',
      entityId: ctx.tenantId,
      summary: 'Regras da organização actualizadas',
      changes: { before: current, after: next },
    })
  })
}
