'use client'

import { useActionState, type ReactNode } from 'react'
import type { ActionResult } from '@/server/actions'

/** Botão que executa uma Server Action já ligada aos seus argumentos (ex.: action.bind(null, id)). */
export function ActionButton({
  action,
  children,
  className = 'btn',
  confirmMessage,
  pendingLabel = 'A processar…',
}: {
  action: () => Promise<ActionResult<unknown>>
  children: ReactNode
  className?: string
  confirmMessage?: string
  pendingLabel?: string
}) {
  const [state, run, pending] = useActionState(async () => action(), null)
  return (
    <form
      action={run}
      onSubmit={(event) => {
        if (confirmMessage && !window.confirm(confirmMessage)) event.preventDefault()
      }}
      className="inline-flex flex-col items-start gap-1"
    >
      <button type="submit" className={className} disabled={pending} aria-busy={pending}>
        {pending ? pendingLabel : children}
      </button>
      {state && !state.ok ? (
        <span role="alert" className="field-error">
          {state.error}
        </span>
      ) : null}
      {state?.ok && state.message ? (
        <span role="status" className="text-[13px] font-medium text-[var(--ok)]">
          {state.message}
        </span>
      ) : null}
    </form>
  )
}
