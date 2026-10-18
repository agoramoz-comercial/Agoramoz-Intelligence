import { isAppError, publicMessage } from './errors'

export type ActionResult<T = undefined> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> }

export const initialActionState: ActionResult<unknown> | null = null

/** Executa uma acção e converte erros em resultado serializável para o formulário. */
export async function runAction<T>(fn: () => Promise<T>, message?: string): Promise<ActionResult<T>> {
  try {
    const data = await fn()
    return { ok: true, data, message }
  } catch (error: unknown) {
    if (isAppError(error)) return { ok: false, error: error.message, fieldErrors: error.fieldErrors }
    if (error && typeof error === 'object' && 'digest' in error) throw error
    return { ok: false, error: publicMessage(error) }
  }
}
