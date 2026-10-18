import type { Metadata } from 'next'
import Link from 'next/link'
import { requirePermission } from '@/server/auth/current'
import { can, ROLE_LABELS } from '@/server/auth/rbac'
import { getRequisition } from '@/modules/requisitions/service'
import { CONTRACT_LABELS, REASON_LABELS, REQUISITION_STATUS_LABELS } from '@/modules/requisitions/schema'
import { applicableSteps } from '@/modules/requisitions/approval'
import { ActionButton } from '@/components/action-button'
import { ActionForm, Field, SubmitButton } from '@/components/form'
import { Badge, KeyValue, PageHeader, Section, StatusBadge } from '@/components/ui'
import { formatDateTime, formatMzn } from '@/lib/format'
import { cancelRequisitionAction, createVacancyAction, decideRequisitionAction, submitRequisitionAction } from '../actions'

export const metadata: Metadata = { title: 'Requisição' }

export default async function RequisitionPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission('requisition.view')
  const { id } = await params
  const detail = await getRequisition(ctx, id)
  const { requisition: r } = detail
  const isOwner = r.requestedBy === ctx.user.id || can(ctx.user.role, 'vacancy.manage')
  const steps = applicableSteps(detail.steps, r.salaryMax === null ? null : Number(r.salaryMax))
  return (
    <div className="space-y-6">
      <PageHeader
        back={{ href: '/app/requisicoes', label: 'Requisições' }}
        title={`${r.code} · ${r.title}`}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <StatusBadge status={r.status} label={REQUISITION_STATUS_LABELS[r.status] ?? r.status} />
            <span>
              Pedida por {r.requesterName} em {formatDateTime(r.createdAt)}
            </span>
          </span>
        }
        actions={
          <>
            {isOwner && (r.status === 'draft' || r.status === 'rejected') ? (
              <Link className="btn btn-quiet" href={`/app/requisicoes/${r.id}/editar`}>
                Editar
              </Link>
            ) : null}
            {isOwner && r.status === 'draft' ? <ActionButton action={submitRequisitionAction.bind(null, r.id)}>Enviar para aprovação</ActionButton> : null}
            {r.status === 'approved' && can(ctx.user.role, 'vacancy.manage') ? (
              r.vacancyId ? (
                <Link className="btn" href={`/app/vagas/${r.vacancyId}`}>
                  Abrir vaga
                </Link>
              ) : (
                <ActionButton action={createVacancyAction.bind(null, r.id)}>Criar vaga a partir desta requisição</ActionButton>
              )
            ) : null}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Section title="Necessidade">
            <KeyValue
              items={[
                { label: 'Departamento', value: r.departmentName ?? '—' },
                { label: 'Localização', value: r.location },
                { label: 'Contrato', value: CONTRACT_LABELS[r.contractType as keyof typeof CONTRACT_LABELS] },
                { label: 'N.º de vagas', value: r.headcount },
                { label: 'Faixa salarial (MZN/mês)', value: r.salaryMin || r.salaryMax ? `${formatMzn(r.salaryMin)} – ${formatMzn(r.salaryMax)}` : 'Não definida' },
                { label: 'Motivo', value: REASON_LABELS[r.reason as keyof typeof REASON_LABELS] },
              ]}
            />
            <h3 className="mt-5 text-[13px] font-semibold text-[var(--muted)]">Justificação</h3>
            <p className="mt-1 whitespace-pre-line">{r.justification}</p>
          </Section>
          <Section title="Critérios aprovados">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div>
                <h3 className="text-[13px] font-semibold text-[var(--muted)]">Requisitos</h3>
                <ul className="mt-2 space-y-1.5">
                  {r.requirements.map((item) => (
                    <li key={item.id} className="flex items-start gap-2">
                      <Badge tone={item.kind === 'must' ? 'info' : 'neutral'}>{item.kind === 'must' ? 'Obrigatório' : 'Desejável'}</Badge>
                      <span>{item.text}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="text-[13px] font-semibold text-[var(--muted)]">Competências (critérios do scorecard)</h3>
                <ul className="mt-2 space-y-2">
                  {r.competencies.map((item) => (
                    <li key={item.id}>
                      <strong>{item.name}</strong>
                      <span className="block text-[14px] text-[var(--muted)]">{item.description}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Section>
        </div>

        <aside className="space-y-6">
          <Section title="Aprovação">
            <ol className="space-y-3">
              {steps.map((step) => {
                const decision = detail.approvals.find((approval) => approval.stepPosition === step.position)
                const current = r.status === 'pending_approval' && r.currentStep === step.position
                return (
                  <li key={step.position} className={`rounded-lg p-3 ${current ? 'bg-[var(--warn-bg)]' : 'bg-[var(--surface)]'}`}>
                    <p className="font-semibold">{step.label}</p>
                    <p className="text-[13px] text-[var(--muted)]">
                      Papel: {ROLE_LABELS[step.role]}
                      {step.minSalaryMax ? ` · a partir de ${formatMzn(step.minSalaryMax)}` : ''}
                    </p>
                    {decision ? (
                      <p className="mt-1.5 text-[13.5px]">
                        <Badge tone={decision.decision === 'approved' ? 'ok' : 'danger'}>{decision.decision === 'approved' ? 'Aprovado' : 'Rejeitado'}</Badge>{' '}
                        por {decision.deciderName}, {formatDateTime(decision.decidedAt)}
                        {decision.comment ? <span className="mt-1 block text-[var(--muted)]">“{decision.comment}”</span> : null}
                      </p>
                    ) : current ? (
                      <p className="mt-1.5 text-[13.5px] font-semibold text-[var(--warn)]">À espera desta decisão</p>
                    ) : null}
                  </li>
                )
              })}
              {steps.length === 0 ? <li className="text-[var(--muted)]">Sem passos aplicáveis: aprovação directa ao submeter.</li> : null}
            </ol>
            {detail.canDecide ? (
              <ActionForm action={decideRequisitionAction.bind(null, r.id)} className="mt-5 space-y-3">
                <Field name="comment" label="Fundamento" hint="Obrigatório para rejeitar. Fica registado na auditoria.">
                  <textarea id="comment" name="comment" className="textarea" rows={3} />
                </Field>
                <div className="flex gap-2">
                  <SubmitButton name="decision" value="approved">
                    Aprovar passo
                  </SubmitButton>
                  <SubmitButton name="decision" value="rejected" className="btn btn-danger">
                    Rejeitar
                  </SubmitButton>
                </div>
              </ActionForm>
            ) : detail.decisionBlockedReason && r.status === 'pending_approval' ? (
              <p className="mt-4 text-[13.5px] text-[var(--muted)]">{detail.decisionBlockedReason}</p>
            ) : null}
          </Section>
          {isOwner && ['draft', 'pending_approval', 'approved'].includes(r.status) && !r.vacancyId ? (
            <Section title="Cancelar requisição">
              <ActionForm action={cancelRequisitionAction.bind(null, r.id)} className="space-y-3">
                <Field name="reason" label="Motivo">
                  <input id="reason" name="reason" className="input" />
                </Field>
                <SubmitButton className="btn btn-quiet">Cancelar requisição</SubmitButton>
              </ActionForm>
            </Section>
          ) : null}
        </aside>
      </div>
    </div>
  )
}
