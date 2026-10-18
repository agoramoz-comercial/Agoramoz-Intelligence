import { z } from 'zod'
import type { Tx } from '@/server/db/client'
import { DEFAULT_TIMEZONE } from '@/lib/time'

export const orgSettingsSchema = z.object({
  timezone: z.string().default(DEFAULT_TIMEZONE),
  /** Feedback de entrevistadores fica oculto até cada um submeter o seu (Blueprint E5). */
  hideFeedbackUntilSubmitted: z.boolean().default(true),
  /** Retenção do processo após decisão, em meses. */
  retentionMonths: z.number().int().min(1).max(60).default(12),
  /** Retenção em talent pool, só com consentimento. */
  talentPoolMonths: z.number().int().min(1).max(60).default(24),
  /** Dias sem movimento para considerar uma candidatura bloqueada. */
  stalledDays: z.number().int().min(1).max(60).default(7),
  privacyContactEmail: z.string().email().optional(),
  consentVersion: z.string().default('2026-10'),
})

export type OrgSettings = z.infer<typeof orgSettingsSchema>

export function parseSettings(raw: unknown): OrgSettings {
  const result = orgSettingsSchema.safeParse(raw ?? {})
  return result.success ? result.data : orgSettingsSchema.parse({})
}

export async function loadSettings(tx: Tx, tenantId: string): Promise<OrgSettings> {
  const [row] = await tx<{ settings: unknown }[]>`select settings from organizations where id = ${tenantId}`
  return parseSettings(row?.settings)
}

const settingsFormSchema = z.object({
  hideFeedbackUntilSubmitted: z.preprocess((value) => value === 'on' || value === true, z.boolean()),
  retentionMonths: z.coerce.number().int().min(1, 'Mínimo 1 mês').max(60, 'Máximo 60 meses'),
  talentPoolMonths: z.coerce.number().int().min(1).max(60),
  stalledDays: z.coerce.number().int().min(1).max(60),
  privacyContactEmail: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || undefined)
    .refine((value) => value === undefined || z.string().email().safeParse(value).success, 'Email inválido'),
})

export type SettingsForm = z.infer<typeof settingsFormSchema>
export { settingsFormSchema }
