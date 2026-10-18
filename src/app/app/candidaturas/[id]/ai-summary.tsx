'use client'

import { useState, useTransition } from 'react'
import type { ActionResult } from '@/server/actions'
import type { CvSummary } from '@/modules/ai/service'

/** Resumo de CV por IA: sempre marcado, com citações verificadas e acção humana explícita. */
export function AiSummary({ run, feedback }: { run: () => Promise<ActionResult<CvSummary>>; feedback: (interactionId: string, action: string) => Promise<ActionResult<null>> }) {
  const [summary, setSummary] = useState<CvSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [closed, setClosed] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function generate() {
    setError(null)
    setClosed(null)
    startTransition(async () => {
      const result = await run()
      if (result.ok) setSummary(result.data)
      else setError(result.error)
    })
  }

  function respond(action: 'accepted' | 'discarded' | 'reported') {
    if (!summary) return
    const id = summary.interactionId
    startTransition(async () => {
      await feedback(id, action)
      setClosed(action === 'reported' ? 'Erro reportado. Obrigado: a equipa revê estes casos.' : action === 'discarded' ? 'Resumo descartado.' : 'Registado como útil.')
      if (action !== 'accepted') setSummary(null)
    })
  }

  return (
    <div>
      {!summary ? (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn btn-quiet" onClick={generate} disabled={pending}>
            {pending ? 'A ler o CV…' : 'Resumir CV com IA'}
          </button>
          <p className="text-[13px] text-[var(--muted)]">Contactos e nome são removidos antes do envio. A IA não pontua nem decide.</p>
        </div>
      ) : (
        <div className="rounded-lg bg-[var(--info-bg)] p-4">
          <p className="mb-2">
            <span className="ai-mark">Gerado por IA · validar</span>
          </p>
          <p className="text-[15px]">{summary.summary}</p>
          {summary.highlights.length ? (
            <ul className="mt-3 space-y-2">
              {summary.highlights.map((item) => (
                <li key={item.claim} className="text-[14px]">
                  <strong>{item.claim}</strong>
                  <blockquote className="mt-0.5 border-l-2 border-[var(--info)] pl-2 text-[var(--muted)]">“{item.quote}”</blockquote>
                </li>
              ))}
            </ul>
          ) : null}
          {summary.toValidate.length ? (
            <div className="mt-3 text-[14px]">
              <p className="font-semibold">Confirmar com o candidato</p>
              <ul className="ml-5 list-disc">
                {summary.toValidate.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {summary.droppedClaims > 0 ? (
            <p className="mt-3 text-[12.5px] text-[var(--muted)]">{summary.droppedClaims} afirmação(ões) removida(s) por a citação não existir no CV.</p>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className="btn btn-sm" onClick={() => respond('accepted')} disabled={pending}>
              Útil
            </button>
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => respond('discarded')} disabled={pending}>
              Descartar
            </button>
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => respond('reported')} disabled={pending}>
              Reportar erro
            </button>
          </div>
        </div>
      )}
      {error ? <p className="field-error">{error}</p> : null}
      {closed ? <p className="mt-2 text-[13px] text-[var(--ok)]">{closed}</p> : null}
    </div>
  )
}
