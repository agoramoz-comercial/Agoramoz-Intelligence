import Link from 'next/link'
import type { ApplicationInterviews } from '@/modules/interviews/service'
import { MODE_LABELS } from '@/modules/interviews/service'
import { RATING_LABELS, RECOMMENDATION_LABELS } from '@/modules/interviews/consolidation'
import { ActionForm, Field, SubmitButton } from '@/components/form'
import { ActionButton } from '@/components/action-button'
import { Badge, StatusBadge } from '@/components/ui'
import { formatDateTime } from '@/lib/format'
import { cancelInterviewAction, completeInterviewAction, scheduleAction } from '../actions'

const STATUS_LABELS: Record<string, string> = { scheduled: 'Agendada', completed: 'Realizada', cancelled: 'Cancelada' }

export function InterviewsPanel({
  applicationId,
  data,
  canSchedule,
  users,
  isActive,
  defaultStart,
}: {
  applicationId: string
  data: ApplicationInterviews
  canSchedule: boolean
  users: { id: string; fullName: string; role: string }[]
  isActive: boolean
  defaultStart: string
}) {
  return (
    <div className="space-y-5">
      {data.ownPending.length > 0 ? (
        <p className="rounded-lg bg-[var(--warn-bg)] p-3 text-[14px]">
          Tem um scorecard por submeter.{' '}
          <Link className="link font-semibold" href={`/app/entrevistas/${data.ownPending[0]!.interviewId}`}>
            Avaliar agora
          </Link>
        </p>
      ) : null}

      {data.interviews.length === 0 ? <p className="text-[var(--muted)]">Ainda sem entrevistas.</p> : null}
      <ul className="space-y-3">
        {data.interviews.map((interview) => (
          <li key={interview.id} className="rounded-lg bg-[var(--surface)] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold">
                {formatDateTime(interview.startsAt)} · {MODE_LABELS[interview.mode]} · {interview.durationMinutes} min
              </p>
              <StatusBadge status={interview.status} label={STATUS_LABELS[interview.status] ?? interview.status} />
            </div>
            {interview.location ? <p className="text-[13.5px] text-[var(--muted)]">{interview.location}</p> : null}
            <p className="mt-1.5 flex flex-wrap gap-1.5 text-[13px]">
              {interview.participants.map((participant) => (
                <Badge key={participant.userId} tone={participant.submitted ? 'ok' : 'neutral'}>
                  {participant.fullName}: {participant.submitted ? 'scorecard submetido' : 'por avaliar'}
                </Badge>
              ))}
            </p>
            {canSchedule && interview.status === 'scheduled' ? (
              <div className="mt-3 flex flex-wrap items-start gap-3">
                <ActionButton className="btn btn-quiet btn-sm" action={completeInterviewAction.bind(null, interview.id)}>
                  Marcar como realizada
                </ActionButton>
                <details>
                  <summary className="btn btn-quiet btn-sm cursor-pointer list-none">Cancelar…</summary>
                  <ActionForm action={cancelInterviewAction.bind(null, interview.id)} className="mt-2 flex flex-wrap items-end gap-2">
                    <Field name="reason" label="Motivo">
                      <input id="reason" name="reason" className="input" />
                    </Field>
                    <SubmitButton className="btn btn-danger btn-sm">Cancelar e avisar candidato</SubmitButton>
                  </ActionForm>
                </details>
              </div>
            ) : null}
          </li>
        ))}
      </ul>

      {data.feedbackHidden ? (
        <p className="rounded-lg bg-[var(--surface)] p-3 text-[14px] text-[var(--muted)]">
          O feedback dos outros entrevistadores fica oculto até submeter o seu scorecard (evita enviesamento).
        </p>
      ) : data.consolidation ? (
        <div>
          <h3 className="mb-2 text-[15px] font-semibold">Consolidação dos scorecards ({data.consolidation.submitted})</h3>
          {data.consolidation.recommendationSplit ? (
            <p className="mb-3 rounded-lg bg-[var(--warn-bg)] p-3 text-[14px] text-[var(--warn)]">
              Recomendações divergentes: discuta as competências assinaladas antes de decidir.
            </p>
          ) : null}
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Competência</th>
                  <th>Avaliações e evidência</th>
                  <th className="text-right">Média</th>
                </tr>
              </thead>
              <tbody>
                {data.consolidation.competencies.map((item) => (
                  <tr key={item.competency.id}>
                    <td className="min-w-40">
                      <strong>{item.competency.name}</strong>
                      {item.disagreement ? (
                        <span className="mt-1 block">
                          <Badge tone="warn">Discordância ({item.min}–{item.max})</Badge>
                        </span>
                      ) : null}
                    </td>
                    <td>
                      <ul className="space-y-1.5">
                        {item.entries.map((entry) => (
                          <li key={entry.authorName} className="text-[13.5px]">
                            <span className="font-semibold">{entry.authorName}</span>: {entry.rating} · {RATING_LABELS[entry.rating]}
                            <span className="block text-[var(--muted)]">{entry.evidence || 'sem evidência descrita'}</span>
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td className="nums text-right">{item.mean?.toFixed(1) ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[13.5px]">
            Recomendações:{' '}
            {Object.entries(data.consolidation.recommendations)
              .filter(([, count]) => count > 0)
              .map(([key, count]) => `${RECOMMENDATION_LABELS[key as keyof typeof RECOMMENDATION_LABELS]} (${count})`)
              .join(' · ')}
          </p>
        </div>
      ) : null}

      {canSchedule && isActive ? (
        <details className="rounded-lg bg-[var(--surface)] p-3">
          <summary className="cursor-pointer font-semibold">Agendar entrevista</summary>
          <ActionForm action={scheduleAction.bind(null, applicationId)} className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field name="startsAt" label="Data e hora (Maputo)">
              <input id="startsAt" name="startsAt" type="datetime-local" className="input" defaultValue={defaultStart} required />
            </Field>
            <Field name="durationMinutes" label="Duração (min)">
              <input id="durationMinutes" name="durationMinutes" type="number" min={10} max={480} defaultValue={45} className="input" />
            </Field>
            <Field name="mode" label="Formato">
              <select id="mode" name="mode" className="select" defaultValue="presencial">
                {Object.entries(MODE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field name="location" label="Local ou ligação">
              <input id="location" name="location" className="input" placeholder="Ex.: Escritório da Matola, sala 2" />
            </Field>
            <fieldset className="md:col-span-2">
              <legend className="label">Entrevistadores</legend>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {users.map((user) => (
                  <label key={user.id} className="check">
                    <input type="checkbox" name="participantIds" value={user.id} />
                    <span>{user.fullName}</span>
                  </label>
                ))}
              </div>
              <p className="hint">Cada entrevistador avalia as mesmas competências da vaga num scorecard individual.</p>
            </fieldset>
            <label className="check md:col-span-2">
              <input type="checkbox" name="notifyCandidate" defaultChecked />
              <span>Enviar convite ao candidato (email com anexo de calendário .ics)</span>
            </label>
            <div className="md:col-span-2">
              <SubmitButton pendingLabel="A agendar…">Agendar</SubmitButton>
            </div>
          </ActionForm>
        </details>
      ) : null}
    </div>
  )
}
