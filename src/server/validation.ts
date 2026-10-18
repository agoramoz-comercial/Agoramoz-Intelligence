import type { z } from 'zod'
import { AppError } from './errors'

/** Valida na fronteira; erros de campo voltam ao formulário em português. */
export function parseInput<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data)
  if (result.success) return result.data
  const fieldErrors: Record<string, string> = {}
  for (const issue of result.error.issues) {
    const key = issue.path.join('.') || '_'
    fieldErrors[key] ??= issue.message
  }
  throw new AppError('VALIDATION', 'Verifique os campos assinalados.', fieldErrors)
}

/** Converte FormData em objecto simples; campos repetidos tornam-se listas. */
export function formDataToObject(form: FormData): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of form.entries()) {
    if (typeof value !== 'string') continue
    const existing = result[key]
    if (existing === undefined) result[key] = value
    else result[key] = Array.isArray(existing) ? [...existing, value] : [existing, value]
  }
  return result
}

export function asList(value: unknown): string[] {
  if (value === undefined || value === null || value === '') return []
  return (Array.isArray(value) ? value : [value]).map(String)
}
