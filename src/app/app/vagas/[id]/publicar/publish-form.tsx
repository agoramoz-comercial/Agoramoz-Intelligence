'use client'

import { useState, useTransition } from 'react'
import { ActionForm, Field, SubmitButton } from '@/components/form'
import type { ActionResult } from '@/server/actions'
import type { JobDescriptionDraft } from '@/modules/ai/service'

interface PublishFormProps {
  action: (state: ActionResult<unknown> | null, form: FormData) => Promise<ActionResult<unknown>>
  draftAction: () => Promise<ActionResult<JobDescriptionDraft>>
  aiEnabled: boolean
  defaults: { summary: string; description: string; salaryVisible: boolean; closesOn: string; screeningQuestions: string }
  hasSalary: boolean
}

export function PublishForm({ action, draftAction, aiEnabled, defaults, hasSalary }: PublishFormProps) {
  const [summary, setSummary] = useState(defaults.summary)
  const [description, setDescription] = useState(defaults.description)
  const [draft, setDraft] = useState<JobDescriptionDraft | null>(null)
  const [aiError, setAiError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function requestDraft() {
    setAiError(null)
    startTransition(async () => {
      const result = await draftAction()
      if (!result.ok) setAiError(result.error)
      else {
        setDraft(result.data)
        setSummary(result.data.summary)
        setDescription(result.data.description)
      }
    })
  }

  return (
    <ActionForm action={action} className="grid max-w-4xl grid-cols-1 gap-5">
      {aiEnabled ? (
        <div className="rounded-lg bg-[var(--info-bg)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[14px]">
              <span className="ai-mark">IA</span> Pode pedir um rascunho estruturado a partir da requisição aprovada. Reveja sempre antes de publicar.
            </p>
            <button type="button" className="btn btn-quiet btn-sm" onClick={requestDraft} disabled={pending}>
              {pending ? 'A gerar rascunho…' : draft ? 'Gerar outro rascunho' : 'Gerar rascunho com IA'}
            </button>
          </div>
          {aiError ? <p className="field-error">{aiError}</p> : null}
          {draft?.missingInformation.length ? (
            <div className="mt-3 text-[14px]">
              <p className="font-semibold">Confirme antes de publicar:</p>
              <ul className="ml-5 list-disc">
                {draft.missingInformation.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
      {draft ? (
        <>
          <input type="hidden" name="aiInteractionId" value={draft.interactionId} />
          <input type="hidden" name="aiAction" value={summary === draft.summary && description === draft.description ? 'accepted' : 'edited'} />
        </>
      ) : null}
      <Field name="summary" label="Resumo (aparece na lista de vagas)" hint={`${summary.length}/280 caracteres`}>
        <textarea id="summary" name="summary" className="textarea" rows={2} maxLength={280} value={summary} onChange={(event) => setSummary(event.target.value)} />
      </Field>
      <Field name="description" label="Descrição completa" hint="Texto simples. Linhas começadas por hífen aparecem como lista.">
        <textarea id="description" name="description" className="textarea" rows={14} value={description} onChange={(event) => setDescription(event.target.value)} />
      </Field>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <Field name="closesOn" label="Data de fecho (opcional)">
          <input id="closesOn" name="closesOn" type="date" className="input" defaultValue={defaults.closesOn} />
        </Field>
        <div className="pt-7">
          <label className="check">
            <input type="checkbox" name="salaryVisible" defaultChecked={defaults.salaryVisible} disabled={!hasSalary} />
            <span>Mostrar a faixa salarial aprovada na página pública{hasSalary ? '' : ' (a requisição não tem faixa)'}</span>
          </label>
        </div>
      </div>
      <Field
        name="screeningQuestions"
        label="Perguntas ao candidato (máx. 8)"
        hint='Uma por linha. "S/N Pergunta" = sim/não, espera sim; "S/N! Pergunta" = espera não; "? Pergunta" = resposta livre. Respostas diferentes do esperado são assinaladas, nunca rejeitam automaticamente.'
      >
        <textarea id="screeningQuestions" name="screeningQuestions" className="textarea" rows={5} defaultValue={defaults.screeningQuestions} />
      </Field>
      <div>
        <SubmitButton pendingLabel="A publicar…">Publicar versão</SubmitButton>
      </div>
    </ActionForm>
  )
}
