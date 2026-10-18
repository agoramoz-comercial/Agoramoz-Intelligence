import type { Metadata } from 'next'
import Link from 'next/link'
import { requirePermission } from '@/server/auth/current'
import { can } from '@/server/auth/rbac'
import { withTenant } from '@/server/db/client'
import { getVacancy } from '@/modules/vacancies/service'
import { getBoard, REJECTION_REASONS } from '@/modules/applications/pipeline'
import { SOURCE_LABELS } from '@/modules/applications/intake'
import { VACANCY_STATUS_LABELS } from '@/modules/vacancies/schema'
import { ActionForm, Field, SubmitButton } from '@/components/form'
import { PageHeader, Section, StatusBadge } from '@/components/ui'
import { formatDate } from '@/lib/format'
import { PipelineBoard } from './board'
import { closeVacancyAction, moveCardAction } from '../actions'

export const metadata: Metadata = { title: 'Vaga' }

export default async function VacancyPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission('vacancy.view')
  const { id } = await params
  const vacancy = await getVacancy(ctx, id)
  const board = can(ctx.user.role, 'application.view') ? await getBoard(ctx, id) : null
  const [org] = await withTenant(ctx.tenantId, (tx) => tx<{ slug: string }[]>`select slug from organizations where id = ${ctx.tenantId}`)
  const manage = can(ctx.user.role, 'vacancy.manage')
  const version = vacancy.currentVersion
  return (
    <div className="space-y-6">
      <PageHeader
        back={{ href: '/app/vagas', label: 'Vagas' }}
        title={version?.title ?? vacancy.requisitionTitle}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <StatusBadge status={vacancy.status} label={VACANCY_STATUS_LABELS[vacancy.status] ?? vacancy.status} />
            <span>
              {vacancy.requisitionCode} · {vacancy.location} · responsável {vacancy.ownerName}
              {version ? ` · versão ${version.version} publicada em ${formatDate(version.publishedAt)}` : ''}
            </span>
          </span>
        }
        actions={
          <>
            {vacancy.status === 'published' && org ? (
              <a className="btn btn-quiet" href={`/carreiras/${org.slug}/${vacancy.slug}`} target="_blank" rel="noreferrer">
                Ver página pública ↗
              </a>
            ) : null}
            {manage && vacancy.status === 'published' && can(ctx.user.role, 'candidate.manage') ? (
              <>
                <Link className="btn btn-quiet" href={`/app/candidatos/novo?vaga=${vacancy.id}`}>
                  Registar candidatura
                </Link>
                <Link className="btn btn-quiet" href={`/app/candidatos/importar?vaga=${vacancy.id}`}>
                  Importar folha
                </Link>
              </>
            ) : null}
            {manage ? (
              <Link className="btn" href={`/app/vagas/${vacancy.id}/publicar`}>
                {vacancy.status === 'draft' ? 'Publicar vaga' : vacancy.status === 'closed' ? 'Reabrir com nova versão' : 'Publicar nova versão'}
              </Link>
            ) : null}
          </>
        }
      />

      {vacancy.status === 'draft' ? (
        <Section>
          <p>
            Esta vaga ainda não está publicada. Escreva o texto público e as perguntas de elegibilidade; os requisitos e competências vêm da requisição aprovada e não mudam na publicação.
          </p>
        </Section>
      ) : null}

      {board ? (
        <Section title="Pipeline">
          <PipelineBoard
            stages={board.stages}
            stalledDays={board.stalledDays}
            canMove={can(ctx.user.role, 'application.move')}
            sourceLabels={SOURCE_LABELS}
            moveAction={moveCardAction}
          />
          {board.rejected.length > 0 ? (
            <details className="mt-4">
              <summary className="cursor-pointer text-[14px] font-semibold">Não seleccionados ({board.rejected.length})</summary>
              <ul className="mt-2 divide-y divide-[var(--grid)] text-[14px]">
                {board.rejected.map((card) => (
                  <li key={card.id} className="flex flex-wrap justify-between gap-2 py-2">
                    <Link className="link" href={`/app/candidaturas/${card.id}`}>
                      {card.candidateName}
                    </Link>
                    <span className="text-[var(--muted)]">{card.rejectionReason ? REJECTION_REASONS[card.rejectionReason as keyof typeof REJECTION_REASONS] : ''}</span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </Section>
      ) : null}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Section title="Critérios desta vaga">
          <ul className="space-y-1.5 text-[14.5px]">
            {vacancy.requirements.map((item) => (
              <li key={item.id}>
                <span className={`badge mr-2 ${item.kind === 'must' ? 'badge-info' : ''}`}>{item.kind === 'must' ? 'Obrigatório' : 'Desejável'}</span>
                {item.text}
              </li>
            ))}
          </ul>
          <h3 className="mt-4 text-[13px] font-semibold text-[var(--muted)]">Competências avaliadas em entrevista</h3>
          <p className="mt-1 text-[14.5px]">{vacancy.competencies.map((item) => item.name).join(' · ')}</p>
        </Section>
        {manage && vacancy.status === 'published' ? (
          <Section title="Fechar a novas candidaturas">
            <ActionForm action={closeVacancyAction.bind(null, vacancy.id)} className="space-y-3">
              <Field name="reason" label="Motivo do fecho" hint="As candidaturas em curso continuam no pipeline.">
                <input id="reason" name="reason" className="input" placeholder="Ex.: número suficiente de candidatos" />
              </Field>
              <SubmitButton className="btn btn-quiet">Fechar vaga</SubmitButton>
            </ActionForm>
          </Section>
        ) : null}
      </div>
    </div>
  )
}
