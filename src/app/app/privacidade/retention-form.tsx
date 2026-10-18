'use client'

import { useActionState } from 'react'
import type { ActionResult } from '@/server/actions'
import type { RetentionCandidate } from '@/modules/privacy/service'

export function RetentionForm({ action }: { action: (state: ActionResult<{ dryRun: boolean; candidates: RetentionCandidate[] }> | null, form: FormData) => Promise<ActionResult<{ dryRun: boolean; candidates: RetentionCandidate[] }>> }) {
  const [state, run, pending] = useActionState(action, null)
  return (
    <form action={run} className="space-y-3">
      <p className="text-[14px] text-[var(--muted)]">
        Anonimiza candidatos cujo prazo de conservação expirou e que não têm processo activo. Faça sempre a simulação primeiro: mostra quem seria afectado sem alterar nada.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn btn-quiet" type="submit" name="intent" value="dry-run" disabled={pending}>
          {pending ? 'A calcular…' : 'Simular (dry-run)'}
        </button>
        <label className="check">
          <input type="checkbox" name="confirm" />
          <span>Confirmo a execução</span>
        </label>
        <button className="btn btn-danger" type="submit" name="intent" value="execute" disabled={pending}>
          Executar retenção
        </button>
      </div>
      {state && !state.ok ? <p className="field-error">{state.error}</p> : null}
      {state?.ok ? (
        <div className="rounded-lg bg-[var(--surface)] p-3 text-[14px]">
          <p className="font-semibold">{state.message}</p>
          {state.data.dryRun ? (
            state.data.candidates.length === 0 ? (
              <p className="mt-1">Nenhum candidato com prazo expirado.</p>
            ) : (
              <ul className="mt-2 space-y-1">
                {state.data.candidates.map((candidate) => (
                  <li key={candidate.id}>
                    {candidate.fullName} · conservar até {candidate.retentionUntil} · {candidate.applications} candidatura(s)
                  </li>
                ))}
              </ul>
            )
          ) : null}
        </div>
      ) : null}
    </form>
  )
}
