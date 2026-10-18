import { appSql } from '../db/client'
import { AppError } from '../errors'

export interface RateLimitRule {
  windowSeconds: number
  max: number
}

export const RATE_LIMITS = {
  login: { windowSeconds: 15 * 60, max: 10 },
  publicApplication: { windowSeconds: 60 * 60, max: 20 },
  privacyRequest: { windowSeconds: 60 * 60, max: 5 },
  aiCall: { windowSeconds: 60 * 60, max: 60 },
} satisfies Record<string, RateLimitRule>

/** Conta um pedido na janela; lança RATE_LIMITED se exceder. Partilhado entre instâncias via Postgres. */
export async function enforceRateLimit(key: string, rule: RateLimitRule): Promise<void> {
  const [row] = await appSql()<{ allowed: boolean }[]>`
    select rate_limit_hit(${key.slice(0, 200)}, ${rule.windowSeconds}, ${rule.max}) as allowed
  `
  if (!row?.allowed) {
    throw new AppError('RATE_LIMITED', 'Demasiadas tentativas. Aguarde alguns minutos e tente novamente.')
  }
}
