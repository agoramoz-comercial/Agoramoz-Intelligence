import type { Metadata } from 'next'
import { requirePermission } from '@/server/auth/current'
import { getScorecardForm } from '@/modules/interviews/service'
import { RATING_LABELS, RECOMMENDATION_LABELS } from '@/modules/interviews/consolidation'
import { ActionForm, Field, FieldError, SubmitButton } from '@/components/form'
import { PageHeader, Section } from '@/components/ui'
import { formatDateTime } from '@/lib/format'
import { saveScorecardAction } from '../actions'

export const metadata: Metadata = { title: 'Scorecard' }

export default async function ScorecardPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission('scorecard.submit')
  const { id } = await params
  const form = await getScorecardForm(ctx, id)
  const submitted = form.existing?.status === 'submitted'
  const rating = (competencyId: string) => form.existing?.ratings.find((item) => item.competencyId === competencyId)
  return (
    <>
      <PageHeader
        back={{ href: '/app/entrevistas', label: 'As minhas entrevistas' }}
        title={`Scorecard · ${form.candidateName}`}
        description={`${form.vacancyTitle} · entrevista de ${formatDateTime(form.startsAt)}. Avalie o que observou, não impressões gerais.`}
      />
      <ActionForm action={saveScorecardAction.bind(null, id)} className="max-w-3xl space-y-5">
        <fieldset disabled={submitted} className="space-y-5">
          {form.competencies.map((competency) => (
            <Section key={competency.id} title={competency.name}>
              <p className="mb-3 text-[14px] text-[var(--muted)]">{competency.description}</p>
              <div role="radiogroup" aria-label={`Avaliação de ${competency.name}`} className="grid grid-cols-1 gap-2 sm:grid-cols-4">
                {[1, 2, 3, 4].map((value) => (
                  <label key={value} className="check rounded-lg bg-[var(--surface)] p-2.5 has-[:checked]:bg-[var(--info-bg)]">
                    <input type="radio" name={`rating_${competency.id}`} value={value} defaultChecked={rating(competency.id)?.rating === value} />
                    <span>
                      <strong>{value}</strong> · {RATING_LABELS[value]}
                    </span>
                  </label>
                ))}
              </div>
              <FieldError name={`rating_${competency.id}`} />
              <Field name={`evidence_${competency.id}`} label="Evidência observada" className="mt-3" hint="O que o candidato disse ou fez que justifica a avaliação.">
                <textarea id={`evidence_${competency.id}`} name={`evidence_${competency.id}`} className="textarea" rows={3} defaultValue={rating(competency.id)?.evidence ?? ''} />
              </Field>
            </Section>
          ))}
          <Section title="Recomendação">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {Object.entries(RECOMMENDATION_LABELS).map(([value, label]) => (
                <label key={value} className="check rounded-lg bg-[var(--surface)] p-2.5 has-[:checked]:bg-[var(--info-bg)]">
                  <input type="radio" name="recommendation" value={value} defaultChecked={form.existing?.recommendation === value} />
                  <span>{label}</span>
                </label>
              ))}
            </div>
            <FieldError name="recommendation" />
            <Field name="summary" label="Síntese (opcional)" className="mt-3">
              <textarea id="summary" name="summary" className="textarea" rows={3} defaultValue={form.existing?.summary ?? ''} />
            </Field>
          </Section>
        </fieldset>
        {submitted ? (
          <p className="badge badge-ok">Submetido: o scorecard já não pode ser alterado.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            <SubmitButton name="intent" value="submit" pendingLabel="A submeter…">
              Submeter scorecard
            </SubmitButton>
            <SubmitButton name="intent" value="draft" className="btn btn-quiet">
              Guardar rascunho
            </SubmitButton>
          </div>
        )}
      </ActionForm>
    </>
  )
}
