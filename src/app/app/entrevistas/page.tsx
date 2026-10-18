import type { Metadata } from 'next'
import Link from 'next/link'
import { requirePermission } from '@/server/auth/current'
import { listMyInterviews, MODE_LABELS } from '@/modules/interviews/service'
import { Badge, EmptyState, PageHeader } from '@/components/ui'
import { formatDateTime } from '@/lib/format'

export const metadata: Metadata = { title: 'As minhas entrevistas' }

export default async function MyInterviewsPage({ searchParams }: { searchParams: Promise<{ submetido?: string }> }) {
  const ctx = await requirePermission('interview.view_assigned')
  const { submetido } = await searchParams
  const interviews = await listMyInterviews(ctx)
  const pending = interviews.filter((interview) => interview.isPast && interview.scorecardStatus !== 'submitted')
  return (
    <>
      <PageHeader title="As minhas entrevistas" description="Avalie cada candidato pelas mesmas competências da vaga, com evidência observada. O seu scorecard é individual." />
      {submetido ? (
        <p role="status" className="badge badge-ok mb-4">
          Scorecard submetido. Obrigado.
        </p>
      ) : null}
      {pending.length > 0 ? (
        <p className="mb-4 rounded-lg bg-[var(--warn-bg)] p-3 text-[14px] text-[var(--warn)]">
          {pending.length} entrevista(s) realizada(s) à espera do seu scorecard.
        </p>
      ) : null}
      {interviews.length === 0 ? (
        <EmptyState title="Sem entrevistas atribuídas" />
      ) : (
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {interviews.map((interview) => {
            const past = interview.isPast
            return (
              <li key={interview.id} className="panel flex flex-col gap-2 p-5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[17px] font-semibold">{interview.candidateName}</p>
                    <p className="text-[13.5px] text-[var(--muted)]">{interview.vacancyTitle}</p>
                  </div>
                  {interview.scorecardStatus === 'submitted' ? (
                    <Badge tone="ok">Avaliado</Badge>
                  ) : past ? (
                    <Badge tone="warn">Por avaliar</Badge>
                  ) : (
                    <Badge tone="info">Agendada</Badge>
                  )}
                </div>
                <p className="text-[14px]">
                  {formatDateTime(interview.startsAt)} · {MODE_LABELS[interview.mode]} · {interview.durationMinutes} min
                  {interview.location ? <span className="block text-[var(--muted)]">{interview.location}</span> : null}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Link className={`btn btn-sm ${interview.scorecardStatus === 'submitted' ? 'btn-quiet' : ''}`} href={`/app/entrevistas/${interview.id}`}>
                    {interview.scorecardStatus === 'submitted' ? 'Ver o meu scorecard' : interview.scorecardStatus === 'draft' ? 'Continuar scorecard' : 'Preencher scorecard'}
                  </Link>
                  <Link className="btn btn-quiet btn-sm" href={`/app/candidaturas/${interview.applicationId}`}>
                    Dossier do candidato
                  </Link>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
