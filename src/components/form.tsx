'use client'

import { createContext, useActionState, useContext, useEffect, useRef, type ReactNode } from 'react'
import { useFormStatus } from 'react-dom'
import type { ActionResult } from '@/server/actions'

type FormAction = (state: ActionResult<unknown> | null, form: FormData) => Promise<ActionResult<unknown>>

interface FormState {
  state: ActionResult<unknown> | null
}

const FormStateContext = createContext<FormState>({ state: null })

interface ActionFormProps {
  action: FormAction
  children: ReactNode
  className?: string
  /** Limpa o formulário depois de sucesso (ex.: novo comentário). */
  resetOnSuccess?: boolean
  encType?: 'multipart/form-data'
}

/** Formulário ligado a uma Server Action: mostra erros gerais e por campo, sem perder o que foi escrito. */
export function ActionForm({ action, children, className, resetOnSuccess, encType }: ActionFormProps) {
  const [state, formAction] = useActionState(action, null)
  const ref = useRef<HTMLFormElement>(null)
  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset()
  }, [state, resetOnSuccess])
  return (
    <FormStateContext.Provider value={{ state }}>
      <form ref={ref} action={formAction} className={className} encType={encType} noValidate>
        <FormMessage />
        {children}
      </form>
    </FormStateContext.Provider>
  )
}

export function FormMessage() {
  const { state } = useContext(FormStateContext)
  if (!state) return null
  if (state.ok) {
    return state.message ? (
      <p role="status" className="badge badge-ok mb-3">
        {state.message}
      </p>
    ) : null
  }
  return (
    <p role="alert" className="mb-3 rounded-md bg-[var(--danger-bg)] px-3 py-2 text-sm font-medium text-[var(--danger)]">
      {state.error}
    </p>
  )
}

export function useFieldError(name: string): string | undefined {
  const { state } = useContext(FormStateContext)
  return state && !state.ok ? state.fieldErrors?.[name] : undefined
}

export function FieldError({ name }: { name: string }) {
  const error = useFieldError(name)
  return error ? (
    <p className="field-error" id={`${name}-error`}>
      {error}
    </p>
  ) : null
}

interface FieldProps {
  name: string
  label: string
  hint?: string
  children: ReactNode
  className?: string
}

/** Rótulo + controlo + ajuda + erro. O controlo filho deve ter id igual a `name`. */
export function Field({ name, label, hint, children, className }: FieldProps) {
  return (
    <div className={className}>
      <label className="label" htmlFor={name}>
        {label}
      </label>
      {children}
      {hint ? <p className="hint">{hint}</p> : null}
      <FieldError name={name} />
    </div>
  )
}

export function SubmitButton({ children, pendingLabel, className = 'btn', name, value }: { children: ReactNode; pendingLabel?: string; className?: string; name?: string; value?: string }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className={className} disabled={pending} aria-busy={pending} name={name} value={value}>
      {pending ? (pendingLabel ?? 'A guardar…') : children}
    </button>
  )
}
