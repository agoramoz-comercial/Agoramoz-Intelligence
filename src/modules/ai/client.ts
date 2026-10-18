import Anthropic from '@anthropic-ai/sdk'
import { aiConfigured, env } from '@/server/env'
import { AppError } from '@/server/errors'

let client: Anthropic | undefined

export const AI_TIMEOUT_MS = 90_000
export const FALLBACK_BETA = 'server-side-fallback-2026-07-01'

export function aiClient(): Anthropic {
  if (!aiConfigured()) throw new AppError('UNAVAILABLE', 'A IA assistiva está desligada nesta instalação.')
  client ??= new Anthropic({ apiKey: env().ANTHROPIC_API_KEY, timeout: AI_TIMEOUT_MS, maxRetries: 2 })
  return client
}

/** Converte erros do fornecedor em mensagens seguras; o detalhe fica no registo da interacção. */
export function describeAiError(error: unknown): { userMessage: string; detail: string } {
  if (error instanceof AppError) return { userMessage: error.message, detail: error.message }
  if (error instanceof Anthropic.RateLimitError) return { userMessage: 'O serviço de IA está ocupado. Tente dentro de um minuto.', detail: `429 ${error.message}` }
  if (error instanceof Anthropic.AuthenticationError) return { userMessage: 'A IA não está bem configurada (credencial). Contacte o administrador.', detail: `401 ${error.message}` }
  if (error instanceof Anthropic.BadRequestError) return { userMessage: 'O pedido à IA foi recusado por formato inválido.', detail: `400 ${error.message}` }
  if (error instanceof Anthropic.APIConnectionTimeoutError) return { userMessage: 'A IA demorou demasiado a responder. Tente novamente.', detail: 'timeout' }
  if (error instanceof Anthropic.APIConnectionError) return { userMessage: 'Sem ligação ao serviço de IA.', detail: `connection ${error.message}` }
  if (error instanceof Anthropic.APIError) return { userMessage: 'O serviço de IA devolveu um erro. Tente novamente.', detail: `${error.status} ${error.message}` }
  return { userMessage: 'Falha inesperada na IA.', detail: error instanceof Error ? error.message : 'desconhecido' }
}
