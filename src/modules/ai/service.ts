import { createHash } from 'node:crypto'
import { z } from 'zod'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { withTenant } from '@/server/db/client'
import { recordAudit } from '@/server/audit/audit'
import { actorOf, type RequestContext } from '@/server/context'
import { AppError, forbidden, notFound } from '@/server/errors'
import { can } from '@/server/auth/rbac'
import { aiConfigured, env } from '@/server/env'
import { enforceRateLimit, RATE_LIMITS } from '@/server/http/rate-limit'
import { CONTRACT_LABELS, type Competency, type Requirement } from '@/modules/requisitions/schema'
import { applicationScope } from '@/modules/applications/scope'
import { aiClient, describeAiError, FALLBACK_BETA } from './client'
import { quoteIsGrounded, redactForAi } from './redact'

/**
 * IA assistiva (E9, Blueprint §7.3–7.4). Regras deste módulo:
 *   - só dados autorizados do tenant, com minimização de dados pessoais antes do envio;
 *   - toda a saída é marcada como IA e exige acção humana explícita (aceitar, editar, descartar);
 *   - nenhuma saída pontua, rejeita ou decide; citações são verificadas contra a fonte;
 *   - cada interacção fica registada (modelo, versão do prompt, custo, latência, decisão humana).
 */

export const PROMPT_VERSIONS = { job_description: 'jd-v1', cv_summary: 'cv-v1' } as const
type UseCase = keyof typeof PROMPT_VERSIONS

export function aiAvailable(): boolean {
  return aiConfigured()
}

interface CallResult<T> {
  output: T
  inputTokens: number
  outputTokens: number
  model: string
}

async function callStructured<T extends z.ZodType>(schema: T, system: string, user: string): Promise<CallResult<z.infer<T>>> {
  const response = await aiClient().beta.messages.parse({
    model: env().AI_MODEL,
    max_tokens: 16000,
    betas: [FALLBACK_BETA],
    fallbacks: 'default',
    output_config: { effort: 'medium', format: betaZodOutputFormat(schema) },
    system,
    messages: [{ role: 'user', content: user }],
  })
  if (response.stop_reason === 'refusal') throw new AppError('UNAVAILABLE', 'A IA recusou este pedido. Prossiga sem assistência.')
  if (response.stop_reason === 'max_tokens') throw new AppError('UNAVAILABLE', 'A resposta da IA ficou incompleta. Tente novamente.')
  if (!response.parsed_output) throw new AppError('UNAVAILABLE', 'A IA devolveu um formato inesperado.')
  return {
    output: response.parsed_output as z.infer<T>,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    model: response.model,
  }
}

async function logInteraction(
  ctx: RequestContext,
  entry: { useCase: UseCase; entityId: string; input: string; output?: unknown; grounding?: unknown; latencyMs: number; tokens?: { input: number; output: number }; model?: string; error?: string },
): Promise<string> {
  return withTenant(ctx.tenantId, async (tx) => {
    const [row] = await tx<{ id: string }[]>`
      insert into ai_interactions (tenant_id, user_id, use_case, entity_id, model, prompt_version, input_sha256, output, grounding, latency_ms, input_tokens, output_tokens, error)
      values (${ctx.tenantId}, ${ctx.user.id}, ${entry.useCase}, ${entry.entityId}, ${entry.model ?? env().AI_MODEL}, ${PROMPT_VERSIONS[entry.useCase]},
        ${createHash('sha256').update(entry.input).digest('hex')}, ${entry.output ? tx.json(entry.output as never) : null},
        ${entry.grounding ? tx.json(entry.grounding as never) : null}, ${entry.latencyMs}, ${entry.tokens?.input ?? null}, ${entry.tokens?.output ?? null}, ${entry.error ?? null})
      returning id
    `
    await recordAudit(tx, actorOf(ctx), {
      action: entry.error ? 'ai.failed' : 'ai.generated',
      entityType: entry.useCase === 'cv_summary' ? 'application' : 'vacancy',
      entityId: entry.entityId,
      summary: entry.useCase === 'cv_summary' ? 'Resumo de CV gerado por IA (rascunho)' : 'Descrição de vaga gerada por IA (rascunho)',
      changes: { interactionId: row?.id, promptVersion: PROMPT_VERSIONS[entry.useCase] },
    })
    return row!.id
  })
}

async function guarded<T>(ctx: RequestContext, useCase: UseCase, entityId: string, input: string, run: () => Promise<{ result: T; call: CallResult<unknown>; grounding?: unknown }>): Promise<T & { interactionId: string }> {
  if (!can(ctx.user.role, 'ai.use')) throw forbidden()
  if (!aiConfigured()) throw new AppError('UNAVAILABLE', 'A IA assistiva está desligada nesta instalação.')
  await enforceRateLimit(`ai:${ctx.tenantId}:${ctx.user.id}`, RATE_LIMITS.aiCall)
  const started = Date.now()
  try {
    const { result, call, grounding } = await run()
    const interactionId = await logInteraction(ctx, {
      useCase,
      entityId,
      input,
      output: result,
      grounding,
      latencyMs: Date.now() - started,
      tokens: { input: call.inputTokens, output: call.outputTokens },
      model: call.model,
    })
    return { ...result, interactionId }
  } catch (error: unknown) {
    const { userMessage, detail } = describeAiError(error)
    await logInteraction(ctx, { useCase, entityId, input, latencyMs: Date.now() - started, error: detail })
    throw new AppError('UNAVAILABLE', userMessage)
  }
}

// ---------------------------------------------------------------------------
// Caso 1: estruturar a descrição de uma vaga a partir da requisição aprovada
// ---------------------------------------------------------------------------

const jobDescriptionSchema = z.object({
  summary: z.string().describe('Resumo público da vaga, até 280 caracteres'),
  description: z.string().describe('Descrição completa em texto simples com secções e listas com hífen'),
  missingInformation: z.array(z.string()).describe('Informação que falta e que o RH deve confirmar antes de publicar'),
})

export type JobDescriptionDraft = z.infer<typeof jobDescriptionSchema> & { interactionId: string }

const JOB_SYSTEM = `És assistente de Recursos Humanos de uma empresa em Moçambique. Escreves anúncios de vaga claros, em português de Moçambique, inclusivos e sem discriminação (idade, género, estado civil, religião, origem, deficiência).
Usa apenas os factos fornecidos. Não inventes salários, benefícios, horários, nomes de clientes ou requisitos. Onde faltar informação útil ao candidato, escreve "[a confirmar]" e regista-a em missingInformation.
Estrutura a descrição com as secções: "Sobre a função", "Principais responsabilidades", "Requisitos obrigatórios", "Requisitos desejáveis", "Como será avaliado(a)" e "Como se candidatar". Usa listas com hífen. Mantém os requisitos tal como foram aprovados.`

export async function draftJobDescription(ctx: RequestContext, vacancyId: string): Promise<JobDescriptionDraft> {
  const source = await withTenant(ctx.tenantId, async (tx) => {
    const [row] = await tx<{ title: string; location: string; contractType: keyof typeof CONTRACT_LABELS; headcount: number; justification: string; requirements: Requirement[]; competencies: Competency[]; orgName: string; sector: string | null }[]>`
      select r.title, r.location, r.contract_type, r.headcount, r.justification, r.requirements, r.competencies, o.name as org_name, o.sector
      from vacancies v join requisitions r on r.id = v.requisition_id join organizations o on o.id = v.tenant_id
      where v.id = ${vacancyId}
    `
    if (!row) throw notFound('Vaga')
    return row
  })
  const input = [
    `Empresa: ${source.orgName}${source.sector ? ` (sector: ${source.sector})` : ''}`,
    `Função: ${source.title}`,
    `Local: ${source.location}`,
    `Contrato: ${CONTRACT_LABELS[source.contractType]}; vagas: ${source.headcount}`,
    `Contexto interno da necessidade (não citar literalmente se for sensível): ${source.justification}`,
    'Requisitos obrigatórios:',
    ...source.requirements.filter((item) => item.kind === 'must').map((item) => `- ${item.text}`),
    'Requisitos desejáveis:',
    ...source.requirements.filter((item) => item.kind === 'nice').map((item) => `- ${item.text}`),
    'Competências avaliadas na entrevista:',
    ...source.competencies.map((item) => `- ${item.name}: ${item.description}`),
  ].join('\n')
  return guarded(ctx, 'job_description', vacancyId, input, async () => {
    const call = await callStructured(jobDescriptionSchema, JOB_SYSTEM, input)
    const summary = call.output.summary.slice(0, 280)
    return { result: { ...call.output, summary }, call }
  })
}

// ---------------------------------------------------------------------------
// Caso 2: resumo do CV com citações literais verificadas
// ---------------------------------------------------------------------------

const cvSummarySchema = z.object({
  summary: z.string().describe('Duas a três frases neutras sobre o percurso declarado no CV'),
  highlights: z
    .array(z.object({ claim: z.string(), quote: z.string().describe('Excerto copiado literalmente do CV que suporta a afirmação') }))
    .describe('Até seis afirmações, cada uma com citação literal'),
  toValidate: z.array(z.string()).describe('Pontos que uma pessoa deve confirmar com o candidato (datas, certificações, lacunas)'),
})

export interface CvSummary {
  summary: string
  highlights: { claim: string; quote: string }[]
  toValidate: string[]
  droppedClaims: number
  interactionId: string
}

const CV_SYSTEM = `Ajudas Recursos Humanos a ler currículos. Resumes apenas o que o texto do CV declara, em português de Moçambique.
Cada afirmação em highlights tem de vir com uma citação copiada literalmente do CV. Se não houver citação, não faças a afirmação.
Não avalies a pessoa, não dês pontuações nem recomendações de contratação, e não infiras idade, género, origem, religião, estado civil, saúde ou outras características pessoais.
Os dados de contacto foram removidos e aparecem como [email], [telefone] ou [candidato].`

export async function summarizeCv(ctx: RequestContext, applicationId: string): Promise<CvSummary> {
  const source = await withTenant(ctx.tenantId, async (tx) => {
    const [row] = await tx<{ fullName: string; cvText: string | null; title: string | null; requirements: Requirement[] | null }[]>`
      select c.full_name, vv.title, vv.requirements,
        (select f.text_content from candidate_files f where f.candidate_id = a.candidate_id and f.kind = 'cv' and f.scan_status = 'clean' and f.text_content is not null
          order by (f.application_id = a.id) desc nulls last, f.created_at desc limit 1) as cv_text
      from applications a join candidates c on c.id = a.candidate_id left join vacancy_versions vv on vv.id = a.vacancy_version_id
      where a.id = ${applicationId} ${applicationScope(tx, ctx)}
    `
    if (!row) throw notFound('Candidatura')
    if (!row.cvText) throw new AppError('VALIDATION', 'Esta candidatura não tem CV com texto extraível.')
    return row
  })
  const cv = redactForAi(source.cvText!, source.fullName)
  const input = [
    source.title ? `Vaga: ${source.title}` : 'Candidatura espontânea',
    source.requirements?.length ? `Requisitos publicados:\n${source.requirements.map((item) => `- ${item.text}`).join('\n')}` : '',
    '<cv>',
    cv,
    '</cv>',
  ].join('\n')
  return guarded(ctx, 'cv_summary', applicationId, input, async () => {
    const call = await callStructured(cvSummarySchema, CV_SYSTEM, input)
    const grounded = call.output.highlights.filter((item) => quoteIsGrounded(item.quote, cv)).slice(0, 6)
    const droppedClaims = call.output.highlights.length - grounded.length
    return {
      result: { summary: call.output.summary, highlights: grounded, toValidate: call.output.toValidate.slice(0, 8), droppedClaims },
      call,
      grounding: { proposed: call.output.highlights.length, verified: grounded.length, dropped: droppedClaims },
    }
  })
}

const humanActionSchema = z.enum(['accepted', 'edited', 'discarded', 'reported'])

/** Regista o que a pessoa fez com a sugestão (avaliação contínua de fidelidade e utilidade). */
export async function recordAiHumanAction(ctx: RequestContext, interactionId: string, action: string): Promise<void> {
  const parsed = humanActionSchema.safeParse(action)
  if (!parsed.success) throw new AppError('VALIDATION', 'Acção inválida.')
  await withTenant(ctx.tenantId, async (tx) => {
    const updated = await tx`
      update ai_interactions set human_action = ${parsed.data} where id = ${interactionId} and user_id = ${ctx.user.id} returning id
    `
    if (updated.length === 0) throw notFound('Interacção')
    await recordAudit(tx, actorOf(ctx), { action: `ai.${parsed.data}`, entityType: 'ai_interaction', entityId: interactionId, summary: `Sugestão de IA: ${parsed.data}` })
  })
}
