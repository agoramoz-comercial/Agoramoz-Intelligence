import { randomUUID } from 'node:crypto'

export interface RequestMeta {
  ip: string | null
  userAgent: string | null
  correlationId: string
}

interface HeaderReader {
  get(name: string): string | null
}

const CORRELATION_PATTERN = /^[A-Za-z0-9._-]{8,64}$/

/** IP, user-agent e correlation ID a partir dos cabeçalhos (o proxy de confiança define x-forwarded-for). */
export function readRequestMeta(headers: HeaderReader): RequestMeta {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  const ip = forwarded || headers.get('x-real-ip') || null
  const incoming = headers.get('x-correlation-id')
  return {
    ip: ip ? ip.slice(0, 64) : null,
    userAgent: headers.get('user-agent')?.slice(0, 300) ?? null,
    correlationId: incoming && CORRELATION_PATTERN.test(incoming) ? incoming : randomUUID(),
  }
}

/**
 * Defesa CSRF para route handlers que alteram estado: o Origin tem de coincidir com o host.
 * (Server Actions do Next.js já fazem esta verificação.)
 */
export function isSameOrigin(headers: HeaderReader): boolean {
  const origin = headers.get('origin')
  const host = headers.get('x-forwarded-host') ?? headers.get('host')
  if (!origin || !host) return false
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}
