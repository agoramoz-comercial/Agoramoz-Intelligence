import type { Metadata } from 'next'
import Link from 'next/link'
import { requirePermission } from '@/server/auth/current'
import { can } from '@/server/auth/rbac'
import { DSR_KINDS, listDsrs, listRetentionRuns } from '@/modules/privacy/service'
import { getSettings } from '@/modules/organizations/service'
import { ActionForm, Field, SubmitButton } from '@/components/form'
import { Badge, EmptyState, PageHeader, Section, StatusBadge } from '@/components/ui'
import { formatDate, formatDateTime } from '@/lib/format'
import { RetentionForm } from './retention-form'
import { resolveDsrAction, retentionAction } from './actions'

export const metadata: Metadata = { title: 'Privacidade' }

const STATUS = { unverified: 'Por verificar', open: 'Aberto', completed: 'Concluído', rejected: 'Recusado' } as const

export default async function PrivacyPage() {
  const ctx = await requirePermission('privacy.manage')
  const [requests, runs, settings] = await Promise.all([listDsrs(ctx), listRetentionRuns(ctx), getSettings(ctx)])
  const open = requests.filter((request) => request.status === 'open')
  return (
    <div className="space-y-6">
      <PageHeader
        title="Privacidade e direitos dos titulares"
        description={
          <>
            Pedidos de acesso, correcção, oposição, portabilidade e eliminação chegam pela{' '}
            <a className="link" href={`/carreiras/${settings.slug}/privacidade`} target="_blank" rel="noreferrer">
              página pública de privacidade
            </a>{' '}
            e são confirmados por email. Prazo interno de resposta: 30 dias. Este módulo não substitui parecer jurídico.
          </>
        }
        actions={
          can(ctx.user.role, 'data.export') ? (
            <a className="btn btn-quiet" href="/api/export/organizacao">
              Exportar todos os dados (ZIP)
            </a>
          ) : null
        }
      />

      <Section title={`Pedidos abertos (${open.length})`}>
        {requests.length === 0 ? (
          <EmptyState title="Sem pedidos de titulares" />
        ) : (
          <ul className="space-y-3">
            {requests.map((request) => (
              <li key={request.id} className="rounded-lg bg-[var(--surface)] p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{DSR_KINDS[request.kind]}</p>
                    <p className="text-[13.5px] text-[var(--muted)]">
                      {request.email} · recebido {formatDateTime(request.createdAt)}
                      {request.status === 'open' ? ` · responder até ${formatDate(request.dueAt)}` : ''}
                    </p>
                  </div>
                  <StatusBadge status={request.status} label={STATUS[request.status]} />
                </div>
                {request.details ? <p className="mt-2 text-[14px]">“{request.details}”</p> : null}
                <p className="mt-2 text-[13.5px]">
                  {request.candidateId ? (
                    <Link className="link" href={`/app/candidatos/${request.candidateId}`}>
                      Registo associado: {request.candidateName}
                    </Link>
                  ) : (
                    <Badge>Sem registo de candidato com este email</Badge>
                  )}
                </p>
                {request.status === 'open' ? (
                  <ActionForm action={resolveDsrAction.bind(null, request.id)} className="mt-3 space-y-2">
                    <Field name="resolution" label="Resposta dada ao titular" hint="Ex.: dados exportados e enviados em 20/10; anonimização executada.">
                      <textarea id="resolution" name="resolution" className="textarea" rows={2} />
                    </Field>
                    <div className="flex gap-2">
                      <SubmitButton className="btn btn-sm" name="outcome" value="completed">
                        Marcar como concluído
                      </SubmitButton>
                      <SubmitButton className="btn btn-quiet btn-sm" name="outcome" value="rejected">
                        Recusar (fundamentado)
                      </SubmitButton>
                    </div>
                  </ActionForm>
                ) : request.resolution ? (
                  <p className="mt-2 text-[13.5px] text-[var(--muted)]">
                    {request.handlerName}: {request.resolution}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Section title="Retenção por finalidade">
          <p className="mb-3 text-[14px]">
            Regra actual: {settings.retentionMonths} meses após a decisão; {settings.talentPoolMonths} meses com consentimento de talent pool.
          </p>
          <RetentionForm action={retentionAction} />
        </Section>
        <Section title="Execuções de retenção">
          {runs.length === 0 ? (
            <EmptyState title="Ainda sem execuções" />
          ) : (
            <ul className="divide-y divide-[var(--grid)] text-[14px]">
              {runs.map((run) => (
                <li key={run.id} className="flex justify-between gap-2 py-2">
                  <span>
                    {formatDateTime(run.createdAt)} · {run.runByName}
                  </span>
                  <span>
                    {run.dryRun ? <Badge>Simulação</Badge> : <Badge tone="warn">Executada</Badge>} {run.candidatesAffected} candidato(s)
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  )
}
