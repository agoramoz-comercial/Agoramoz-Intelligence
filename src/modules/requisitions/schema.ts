import { randomBytes } from 'node:crypto'
import { z } from 'zod'

export const CONTRACT_TYPES = ['sem_termo', 'a_prazo', 'estagio', 'prestacao_servicos', 'temporario'] as const
export const CONTRACT_LABELS: Record<(typeof CONTRACT_TYPES)[number], string> = {
  sem_termo: 'Sem termo',
  a_prazo: 'A prazo',
  estagio: 'Estágio',
  prestacao_servicos: 'Prestação de serviços',
  temporario: 'Temporário',
}

export const REASONS = ['nova_posicao', 'substituicao', 'expansao', 'projecto'] as const
export const REASON_LABELS: Record<(typeof REASONS)[number], string> = {
  nova_posicao: 'Nova posição',
  substituicao: 'Substituição',
  expansao: 'Expansão da equipa',
  projecto: 'Projecto específico',
}

export const REQUISITION_STATUS_LABELS: Record<string, string> = {
  draft: 'Rascunho',
  pending_approval: 'Em aprovação',
  approved: 'Aprovada',
  rejected: 'Rejeitada',
  cancelled: 'Cancelada',
}

export interface Requirement {
  id: string
  text: string
  kind: 'must' | 'nice'
}

export interface Competency {
  id: string
  name: string
  description: string
}

function shortId(): string {
  return randomBytes(4).toString('hex')
}

function lines(value: string | undefined): string[] {
  return (value ?? '')
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*•\s]+/, '').trim())
    .filter((line) => line.length > 0)
}

export function parseRequirements(must: string | undefined, nice: string | undefined): Requirement[] {
  return [
    ...lines(must).map((text) => ({ id: shortId(), text: text.slice(0, 300), kind: 'must' as const })),
    ...lines(nice).map((text) => ({ id: shortId(), text: text.slice(0, 300), kind: 'nice' as const })),
  ]
}

/** "Nome: descrição" por linha; sem descrição usa o nome. */
export function parseCompetencies(value: string | undefined): Competency[] {
  return lines(value).map((line) => {
    const [name, ...rest] = line.split(':')
    const cleanName = (name ?? line).trim().slice(0, 80)
    return { id: shortId(), name: cleanName, description: (rest.join(':').trim() || cleanName).slice(0, 300) }
  })
}

const optionalMoney = z
  .union([z.string(), z.number()])
  .optional()
  .transform((value) => (value === undefined || value === '' ? null : Number(String(value).replace(/[\s.]/g, '').replace(',', '.'))))
  .refine((value) => value === null || (Number.isFinite(value) && value >= 0), 'Valor inválido')

export const requisitionFormSchema = z
  .object({
    title: z.string().trim().min(3, 'Indique a função').max(120),
    departmentId: z.string().uuid().optional().or(z.literal('').transform(() => undefined)),
    location: z.string().trim().min(2, 'Indique a localização').max(120),
    contractType: z.enum(CONTRACT_TYPES, { message: 'Escolha o tipo de contrato' }),
    headcount: z.coerce.number().int().min(1).max(500),
    salaryMin: optionalMoney,
    salaryMax: optionalMoney,
    reason: z.enum(REASONS, { message: 'Escolha o motivo' }),
    justification: z.string().trim().min(10, 'Justifique a necessidade (mín. 10 caracteres)').max(2000),
    requirementsMust: z.string().optional(),
    requirementsNice: z.string().optional(),
    competencies: z.string().optional(),
  })
  .refine((data) => data.salaryMin === null || data.salaryMax === null || data.salaryMin <= data.salaryMax, {
    message: 'O mínimo não pode exceder o máximo',
    path: ['salaryMax'],
  })
  .refine((data) => lines(data.requirementsMust).length > 0, {
    message: 'Indique pelo menos um requisito obrigatório',
    path: ['requirementsMust'],
  })
  .refine((data) => lines(data.competencies).length > 0, {
    message: 'Indique pelo menos uma competência a avaliar na entrevista',
    path: ['competencies'],
  })

export type RequisitionForm = z.infer<typeof requisitionFormSchema>
