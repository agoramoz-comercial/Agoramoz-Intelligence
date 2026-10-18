import { withTenant } from '@/server/db/client'
import { recordAudit } from '@/server/audit/audit'
import { actorOf, type RequestContext } from '@/server/context'
import { AppError, forbidden } from '@/server/errors'
import { can } from '@/server/auth/rbac'
import { parseCsv } from '@/lib/csv'
import { normalizeText } from '@/lib/text'
import { candidateFieldsSchema, intakeApplication, APPLICATION_SOURCES, type ApplicationSource } from '@/modules/applications/intake'
import type { Requirement } from '@/modules/requisitions/schema'
import type { ScreeningQuestion } from '@/modules/vacancies/schema'

export const IMPORT_COLUMNS = ['nome', 'email', 'telefone', 'localidade', 'origem', 'talent_pool'] as const
const MAX_ROWS = 2000

const HEADER_ALIASES: Record<string, (typeof IMPORT_COLUMNS)[number]> = {
  nome: 'nome',
  'nome completo': 'nome',
  name: 'nome',
  email: 'email',
  'e-mail': 'email',
  telefone: 'telefone',
  telemovel: 'telefone',
  celular: 'telefone',
  phone: 'telefone',
  localidade: 'localidade',
  cidade: 'localidade',
  provincia: 'localidade',
  origem: 'origem',
  canal: 'origem',
  talent_pool: 'talent_pool',
  'talent pool': 'talent_pool',
}

const SOURCE_ALIASES: Record<string, ApplicationSource> = {
  email: 'email',
  whatsapp: 'whatsapp',
  referencia: 'referral',
  referral: 'referral',
  manual: 'manual',
  importacao: 'import',
  import: 'import',
}

export interface ImportRowResult {
  line: number
  ok: boolean
  name: string
  errors: string[]
  warnings: string[]
}

export interface ImportReport {
  dryRun: boolean
  totalRows: number
  valid: number
  invalid: number
  imported: number
  duplicatesSuggested: number
  rows: ImportRowResult[]
  missingColumns: string[]
}

interface ParsedRow {
  line: number
  fullName: string
  email: string | null
  phone: string | null
  location: string | null
  source: ApplicationSource
  talentPool: boolean
}

export function parseImport(csvText: string): { parsed: ParsedRow[]; report: Omit<ImportReport, 'dryRun' | 'imported' | 'duplicatesSuggested'> } {
  const table = parseCsv(csvText)
  const header = (table[0] ?? []).map((cell) => HEADER_ALIASES[normalizeText(cell)] ?? null)
  const missingColumns = (['nome'] as const).filter((column) => !header.includes(column))
  if (!header.includes('email') && !header.includes('telefone')) missingColumns.push('email ou telefone' as never)
  const body = table.slice(1, MAX_ROWS + 1)
  const parsed: ParsedRow[] = []
  const rows: ImportRowResult[] = []
  const seen = new Set<string>()
  body.forEach((cells, index) => {
    const line = index + 2
    const get = (column: (typeof IMPORT_COLUMNS)[number]) => {
      const position = header.indexOf(column)
      return position >= 0 ? (cells[position] ?? '').trim() : ''
    }
    const result = candidateFieldsSchema.safeParse({ fullName: get('nome'), email: get('email'), phone: get('telefone'), location: get('localidade') })
    const errors = result.success ? [] : result.error.issues.map((issue) => issue.message)
    const warnings: string[] = []
    const sourceRaw = normalizeText(get('origem'))
    const source = SOURCE_ALIASES[sourceRaw] ?? 'import'
    if (sourceRaw && !SOURCE_ALIASES[sourceRaw]) warnings.push(`Origem "${get('origem')}" desconhecida: registada como importação`)
    if (result.success) {
      const key = result.data.email ?? result.data.phone ?? ''
      if (seen.has(key)) warnings.push('Repetido neste ficheiro: será sugerido como duplicado')
      seen.add(key)
      parsed.push({ line, ...result.data, source, talentPool: ['sim', 's', 'yes', 'true', '1'].includes(normalizeText(get('talent_pool'))) })
    }
    rows.push({ line, ok: errors.length === 0, name: get('nome') || '(sem nome)', errors, warnings })
  })
  return {
    parsed,
    report: { totalRows: body.length, valid: parsed.length, invalid: rows.filter((row) => !row.ok).length, rows, missingColumns },
  }
}

/**
 * Importa candidatos de uma folha de cálculo (CSV exportado do Excel). Em dry-run nada é gravado.
 * O consentimento declarado é o da recolha original; quem importa confirma-o explicitamente.
 */
export async function importCandidates(
  ctx: RequestContext,
  input: { csvText: string; vacancyId: string | null; dryRun: boolean; consentConfirmed: boolean },
): Promise<ImportReport> {
  if (!can(ctx.user.role, 'candidate.manage')) throw forbidden()
  if (input.csvText.length > 2_000_000) throw new AppError('VALIDATION', 'Ficheiro demasiado grande (máx. 2 MB).')
  const { parsed, report } = parseImport(input.csvText)
  if (report.missingColumns.length > 0) {
    throw new AppError('VALIDATION', `Colunas em falta: ${report.missingColumns.join(', ')}. Use o modelo: ${IMPORT_COLUMNS.join(', ')}.`)
  }
  if (input.dryRun) return { ...report, dryRun: true, imported: 0, duplicatesSuggested: 0 }
  if (!input.consentConfirmed) throw new AppError('VALIDATION', 'Confirme a base de tratamento dos dados importados.')

  const target = await withTenant(ctx.tenantId, async (tx) => {
    const [org] = await tx<{ slug: string; name: string }[]>`select slug, name from organizations where id = ${ctx.tenantId}`
    if (!input.vacancyId) return { orgSlug: org!.slug, orgName: org!.name, vacancy: null }
    const [vacancy] = await tx<{ vacancyId: string; versionId: string; title: string; requirements: Requirement[]; screeningQuestions: ScreeningQuestion[] }[]>`
      select v.id as vacancy_id, vv.id as version_id, vv.title, vv.requirements, vv.screening_questions
      from vacancies v join vacancy_versions vv on vv.id = v.published_version_id where v.id = ${input.vacancyId} and v.status = 'published'
    `
    if (!vacancy) throw new AppError('VALIDATION', 'Escolha uma vaga publicada.')
    return { orgSlug: org!.slug, orgName: org!.name, vacancy }
  })

  let imported = 0
  let duplicatesSuggested = 0
  const actor = actorOf(ctx)
  for (const row of parsed) {
    const result = await intakeApplication(
      actor,
      target,
      {
        candidate: { fullName: row.fullName, email: row.email, phone: row.phone, location: row.location },
        consentTalentPool: row.talentPool,
        consentWhatsapp: false,
        consentRecordedAt: new Date(),
        coverNote: null,
        answers: [],
        source: APPLICATION_SOURCES.includes(row.source) ? row.source : 'import',
        ownerId: ctx.user.id,
        notifyCandidate: false,
      },
      null,
    )
    if (result.alreadyApplied) {
      const entry = report.rows.find((item) => item.line === row.line)
      entry?.warnings.push('Já tinha candidatura a esta vaga: não foi duplicada')
    } else imported++
  }
  duplicatesSuggested = await withTenant(ctx.tenantId, async (tx) => {
    const [row] = await tx<{ count: number }[]>`select count(*)::int as count from duplicate_suggestions where status = 'open' and created_at > now() - interval '10 minutes'`
    await recordAudit(tx, actor, {
      action: 'candidates.imported',
      entityType: 'import',
      summary: `Importação de ${imported} candidato(s) de folha de cálculo`,
      changes: { totalRows: report.totalRows, imported, invalid: report.invalid, vacancyId: input.vacancyId },
    })
    return row?.count ?? 0
  })
  return { ...report, dryRun: false, imported, duplicatesSuggested }
}
