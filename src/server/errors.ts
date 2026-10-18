export type AppErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'UNAVAILABLE'

const httpStatus: Record<AppErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 422,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  UNAVAILABLE: 503,
}

/** Erro de domínio com mensagem segura para o utilizador (nunca expõe detalhes internos). */
export class AppError extends Error {
  readonly code: AppErrorCode
  readonly fieldErrors?: Record<string, string>

  constructor(code: AppErrorCode, message: string, fieldErrors?: Record<string, string>) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.fieldErrors = fieldErrors
  }

  get status(): number {
    return httpStatus[this.code]
  }
}

export function notFound(what = 'Registo'): AppError {
  return new AppError('NOT_FOUND', `${what} não encontrado.`)
}

export function forbidden(): AppError {
  return new AppError('FORBIDDEN', 'Não tem permissão para esta acção.')
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError
}

/** Mensagem apresentável: erros de domínio passam; o resto é registado e genérico. */
export function publicMessage(error: unknown): string {
  if (isAppError(error)) return error.message
  console.error('[unexpected]', error)
  return 'Ocorreu um erro inesperado. A equipa técnica foi notificada; tente novamente.'
}
