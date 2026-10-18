import { randomBytes } from 'node:crypto'
import { z } from 'zod'

export const DEFAULT_STAGES = [
  { name: 'Nova', kind: 'new' },
  { name: 'Triagem', kind: 'screening' },
  { name: 'Entrevista', kind: 'interview' },
  { name: 'Avaliação final', kind: 'assessment' },
  { name: 'Oferta', kind: 'offer' },
  { name: 'Contratado', kind: 'hired' },
] as const

export type StageKind = (typeof DEFAULT_STAGES)[number]['kind']

export const VACANCY_STATUS_LABELS: Record<string, string> = {
  draft: 'Por publicar',
  published: 'Publicada',
  closed: 'Fechada',
}

export interface ScreeningQuestion {
  id: string
  text: string
  kind: 'yes_no' | 'text'
  required: boolean
  /** Resposta esperada para perguntas de elegibilidade; serve só para assinalar, nunca para rejeitar. */
  expected?: 'yes' | 'no'
}

/** Formato por linha: "? Pergunta" (texto livre) ou "S/N Pergunta" (sim/não, espera sim) ou "S/N! Pergunta" (espera não). */
export function parseScreeningQuestions(value: string | undefined): ScreeningQuestion[] {
  return (value ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 8)
    .map((line) => {
      const id = randomBytes(4).toString('hex')
      if (/^s\/n!\s+/i.test(line)) return { id, text: line.replace(/^s\/n!\s+/i, '').slice(0, 300), kind: 'yes_no' as const, required: true, expected: 'no' as const }
      if (/^s\/n\s+/i.test(line)) return { id, text: line.replace(/^s\/n\s+/i, '').slice(0, 300), kind: 'yes_no' as const, required: true, expected: 'yes' as const }
      return { id, text: line.replace(/^\?\s*/, '').slice(0, 300), kind: 'text' as const, required: false }
    })
}

export function serializeScreeningQuestions(questions: readonly ScreeningQuestion[]): string {
  return questions
    .map((question) => {
      if (question.kind === 'text') return `? ${question.text}`
      return question.expected === 'no' ? `S/N! ${question.text}` : `S/N ${question.text}`
    })
    .join('\n')
}

export const publishSchema = z.object({
  summary: z.string().trim().min(20, 'Resumo demasiado curto (mín. 20 caracteres)').max(280, 'Máximo 280 caracteres'),
  description: z.string().trim().min(80, 'Descreva a função (mín. 80 caracteres)').max(8000),
  salaryVisible: z.preprocess((value) => value === 'on' || value === 'true' || value === true, z.boolean()),
  closesOn: z
    .string()
    .optional()
    .transform((value) => (value ? value : null))
    .refine((value) => value === null || /^\d{4}-\d{2}-\d{2}$/.test(value), 'Data inválida'),
  screeningQuestions: z.string().max(3000).optional(),
})
