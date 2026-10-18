export type TemplateVars = Partial<Record<'candidato' | 'vaga' | 'empresa' | 'referencia' | 'data_entrevista' | 'local' | 'etapa' | 'link' | 'mensagem', string>>

/** Substitui {{variavel}}; variáveis desconhecidas ficam vazias para nunca expor a sintaxe ao candidato. */
export function renderTemplate(template: string, vars: TemplateVars): string {
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_, name: string) => (vars as Record<string, string | undefined>)[name] ?? '')
}

export const RETRY_SCHEDULE_MINUTES = [1, 5, 30, 120] as const
export const MAX_ATTEMPTS = RETRY_SCHEDULE_MINUTES.length + 1

/** Próxima tentativa após `attempts` falhas; null significa dead-letter. */
export function nextAttemptDelayMinutes(attempts: number): number | null {
  return attempts >= MAX_ATTEMPTS ? null : (RETRY_SCHEDULE_MINUTES[attempts - 1] ?? null)
}
