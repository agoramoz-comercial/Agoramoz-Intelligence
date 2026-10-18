import type { Metadata } from 'next'
import Link from 'next/link'
import { requireUser } from '@/server/auth/current'
import { can } from '@/server/auth/rbac'
import { getApplicationDetail } from '@/modules/applications/detail'
import { REJECTION_REASONS } from '@/modules/applications/pipeline'
import { SOURCE_LABELS, type ApplicationSource } from '@/modules/applications/intake'
import { getApplicationInterviews } from '@/modules/interviews/service'
import { listMessages } from '@/modules/communications/service'
import { listActiveUsers } from '@/modules/users/service'
import { listVacancies } from '@/modules/vacancies/service'
import { aiAvailable } from '@/modules/ai/service'
import { ActionForm, Field, SubmitButton } from '@/components/form'
import { ActionButton } from '@/components/action-button'
import { Badge, KeyValue, PageHeader, Section, StatusBadge } from '@/components/ui'
import { formatDate, formatDateTime } from '@/lib/format'
import { suggestedInterviewSlot } from '@/lib/time'
import { AiSummary } from './ai-summary'
import { AnswersPanel, EvidencePanel } from './evidence'
import { InterviewsPanel } from './interviews'
import {
  aiFeedbackAction,
  commentAction,
  hireAction,
  informationRequestAction,
  linkVacancyAction,
  moveAction,
  ownerAction,
  rejectAction,
  reopenAction,
  retryMessageAction,
  summarizeCvAction,
  tagsAction,
} from '../actions'

export const metadata: Metadata = { title: 'Dossier de candidatura' }

const STATUS_LABELS: Record<string, string> = { active: 'Em processo', hired: 'Contratado', rejected: 'Não seleccionado', withdrawn: 'Retirada' }
const MESSAGE_STATUS: Record<string, string> = { queued: 'Em fila', sending: 'A enviar', sent: 'Entregue', failed: 'Falhou (nova tentativa)', dead: 'Falhou (esgotado)' }

export default async function ApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireUser()
  const { id } = await params
  const app = await getApplicationDetail(ctx, id)
  const role = ctx.user.role
  const [interviews, messages, users, vacancies] = await Promise.all([
    getApplicationInterviews(ctx, id),
    can(role, 'message.view') ? listMessages(ctx, { applicationId: id }) : Promise.resolve([]),
    can(role, 'interview.schedule') || can(role, 'application.move') ? listActiveUsers(ctx) : Promise.resolve([]),
    !app.vacancy && can(role, 'application.move') ? listVacancies(ctx, 'published') : Promise.resolve([]),
  ])
  const decide = can(role, 'application.decide')
  const move = can(role, 'application.move')
  const active = app.status === 'active'

  return (
    <div className="space-y-6">
      <PageHeader
        back={app.vacancy ? { href: `/app/vagas/${app.vacancy.id}`, label: app.vacancy.title } : { href: '/app/candidatos', label: 'Candidatos' }}
        title={app.candidate.fullName}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <StatusBadge status={app.status} label={STATUS_LABELS[app.status] ?? app.status} />
            {app.stageName ? <Badge tone="info">{app.stageName}</Badge> : null}
            <span>
              {app.vacancy ? `${app.vacancy.title} (versão ${app.vacancy.version})` : 'Candidatura espontânea'} · {app.reference} · {SOURCE_LABELS[app.source as ApplicationSource] ?? app.source} · recebida em {formatDate(app.createdAt)}
            </span>
          </span>
        }
      />

      {app.candidate.hasOpenDuplicate && can(role, 'candidate.view') ? (
        <p className="rounded-lg bg-[var(--info-bg)] p-3 text-[14px] text-[var(--info)]">
          Possível registo duplicado desta pessoa.{' '}
          <Link className="link font-semibold" href={`/app/candidatos/${app.candidate.id}`}>
            Rever e decidir fusão
          </Link>
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-6">
          <Section title="Evidência face aos requisitos">
            <EvidencePanel evidence={app.evidence} />
          </Section>

          {aiAvailable() && can(role, 'ai.use') && app.files.some((file) => file.hasText) ? (
            <Section title="Resumo assistido">
              <AiSummary run={summarizeCvAction.bind(null, id)} feedback={aiFeedbackAction} />
            </Section>
          ) : null}

          {app.vacancy?.screeningQuestions.length || app.coverNote ? (
            <Section title="Respostas do candidato">
              <AnswersPanel questions={app.vacancy?.screeningQuestions ?? []} answers={app.answers} />
              {app.coverNote ? (
                <div className="mt-4">
                  <h3 className="text-[13px] font-semibold text-[var(--muted)]">Nota de apresentação</h3>
                  <p className="mt-1 whitespace-pre-line">{app.coverNote}</p>
                </div>
              ) : null}
            </Section>
          ) : null}

          <Section title="Entrevistas e avaliação">
            <InterviewsPanel
              applicationId={id}
              data={interviews}
              canSchedule={can(role, 'interview.schedule')}
              users={users.filter((user) => user.role !== 'privacy_officer')}
              isActive={active}
              defaultStart={suggestedInterviewSlot()}
            />
          </Section>

          {!app.contactHidden ? (
            <Section title="Comentários internos">
              <ul className="space-y-3">
                {app.comments.map((comment) => (
                  <li key={comment.id} className="rounded-lg bg-[var(--surface)] p-3">
                    <p className="text-[13px] text-[var(--muted)]">
                      <strong className="text-[var(--ink)]">{comment.authorName}</strong> · {formatDateTime(comment.createdAt)}
                    </p>
                    <p className="mt-1 whitespace-pre-line">{comment.body}</p>
                  </li>
                ))}
                {app.comments.length === 0 ? <li className="text-[var(--muted)]">Sem comentários.</li> : null}
              </ul>
              {can(role, 'comment.create') ? (
                <ActionForm action={commentAction.bind(null, id)} resetOnSuccess className="mt-4 space-y-2">
                  <Field name="body" label="Novo comentário" hint="Visível para a equipa de recrutamento. Escreva factos observáveis.">
                    <textarea id="body" name="body" className="textarea" rows={3} />
                  </Field>
                  <SubmitButton className="btn btn-quiet">Comentar</SubmitButton>
                </ActionForm>
              ) : null}
            </Section>
          ) : null}

          {app.timeline.length ? (
            <Section title="Histórico auditado">
              <ol className="space-y-2 text-[13.5px]">
                {app.timeline.map((event, index) => (
                  <li key={index} className="grid grid-cols-[150px_1fr] gap-3">
                    <span className="nums text-[var(--muted)]">{formatDateTime(event.occurredAt)}</span>
                    <span>
                      {event.summary}
                      <span className="text-[var(--muted)]"> — {event.actorName ?? (event.actorType === 'candidate' ? 'candidato' : 'sistema')}</span>
                      {event.reason ? <span className="block text-[var(--muted)]">Fundamento: {event.reason}</span> : null}
                    </span>
                  </li>
                ))}
              </ol>
            </Section>
          ) : null}
        </div>

        <aside className="space-y-6">
          <Section title="Candidato">
            <KeyValue
              columns={1}
              items={[
                { label: 'Email', value: app.contactHidden ? 'Oculto (need-to-know)' : (app.candidate.email ?? '—') },
                { label: 'Telefone', value: app.contactHidden ? 'Oculto (need-to-know)' : (app.candidate.phone ?? '—') },
                { label: 'Localidade', value: app.candidate.location ?? '—' },
                { label: 'Consentimentos', value: [app.candidate.consentTalentPool ? 'Talent pool' : null, app.candidate.consentWhatsapp ? 'WhatsApp' : null].filter(Boolean).join(' · ') || 'Só esta candidatura' },
              ]}
            />
            {can(role, 'candidate.view') ? (
              <Link className="link mt-4 inline-block text-[14px]" href={`/app/candidatos/${app.candidate.id}`}>
                Perfil completo e privacidade →
              </Link>
            ) : null}
          </Section>

          <Section title="Documentos">
            {app.files.length === 0 ? <p className="text-[var(--muted)]">Sem CV. Peça-o ao candidato por mensagem.</p> : null}
            <ul className="space-y-2">
              {app.files.map((file) => (
                <li key={file.id} className="flex items-center justify-between gap-2 text-[14px]">
                  {file.scanStatus === 'clean' ? (
                    <a className="link" href={`/api/files/${file.id}`}>
                      {file.filename}
                    </a>
                  ) : (
                    <span>{file.filename}</span>
                  )}
                  <span className="text-[12.5px] text-[var(--muted)]">
                    {Math.ceil(file.sizeBytes / 1024)} KB{file.hasText ? '' : ' · sem texto'}
                  </span>
                </li>
              ))}
            </ul>
          </Section>

          {active && (move || decide) ? (
            <Section title="Processo">
              <div className="space-y-5">
                {move && app.vacancy ? (
                  <ActionForm action={moveAction.bind(null, id)} className="space-y-2">
                    <Field name="stageId" label="Etapa">
                      <select id="stageId" name="stageId" className="select" defaultValue={app.stageId ?? ''}>
                        {app.stages.map((stage) => (
                          <option key={stage.id} value={stage.id} disabled={stage.kind === 'hired'}>
                            {stage.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <label className="check">
                      <input type="checkbox" name="notify" />
                      <span>Avisar o candidato da progressão</span>
                    </label>
                    <SubmitButton className="btn btn-quiet btn-sm">Mudar etapa</SubmitButton>
                  </ActionForm>
                ) : null}
                {move && !app.vacancy && vacancies.length ? (
                  <ActionForm action={linkVacancyAction.bind(null, id)} className="space-y-2">
                    <Field name="vacancyId" label="Associar a uma vaga publicada">
                      <select id="vacancyId" name="vacancyId" className="select">
                        {vacancies.map((vacancy) => (
                          <option key={vacancy.id} value={vacancy.id}>
                            {vacancy.title}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <SubmitButton className="btn btn-quiet btn-sm">Associar</SubmitButton>
                  </ActionForm>
                ) : null}
                {move ? (
                  <>
                    <ActionForm action={ownerAction.bind(null, id)} className="space-y-2">
                      <Field name="ownerId" label="Responsável">
                        <select id="ownerId" name="ownerId" className="select" defaultValue={app.ownerId ?? ''}>
                          <option value="">— Sem responsável —</option>
                          {users
                            .filter((user) => user.role === 'hr' || user.role === 'org_admin')
                            .map((user) => (
                              <option key={user.id} value={user.id}>
                                {user.fullName}
                              </option>
                            ))}
                        </select>
                      </Field>
                      <SubmitButton className="btn btn-quiet btn-sm">Atribuir</SubmitButton>
                    </ActionForm>
                    <ActionForm action={tagsAction.bind(null, id)} className="space-y-2">
                      <Field name="tags" label="Etiquetas" hint="Separadas por vírgula.">
                        <input id="tags" name="tags" className="input" defaultValue={app.tags.join(', ')} />
                      </Field>
                      <SubmitButton className="btn btn-quiet btn-sm">Guardar</SubmitButton>
                    </ActionForm>
                  </>
                ) : null}
              </div>
            </Section>
          ) : null}

          {decide ? (
            <Section title="Decisão">
              {active ? (
                <div className="space-y-5">
                  {app.vacancy ? (
                    <ActionForm action={hireAction.bind(null, id)} className="space-y-2">
                      <label className="check">
                        <input type="checkbox" name="notify" defaultChecked />
                        <span>Comunicar a selecção ao candidato</span>
                      </label>
                      <SubmitButton>Contratar</SubmitButton>
                    </ActionForm>
                  ) : null}
                  <ActionForm action={rejectAction.bind(null, id)} className="space-y-2">
                    <Field name="reason" label="Motivo de não selecção">
                      <select id="reason" name="reason" className="select" defaultValue="">
                        <option value="" disabled>
                          Escolha o motivo…
                        </option>
                        {Object.entries(REJECTION_REASONS).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field name="note" label="Fundamento (interno)">
                      <textarea id="note" name="note" className="textarea" rows={2} />
                    </Field>
                    <label className="check">
                      <input type="checkbox" name="notify" defaultChecked />
                      <span>Enviar resposta final ao candidato</span>
                    </label>
                    <SubmitButton className="btn btn-danger">Não seleccionar</SubmitButton>
                  </ActionForm>
                </div>
              ) : (
                <div className="space-y-3">
                  <p>
                    {STATUS_LABELS[app.status]} em {formatDateTime(app.decidedAt)}.
                    {app.rejectionReason ? ` Motivo: ${REJECTION_REASONS[app.rejectionReason as keyof typeof REJECTION_REASONS]}.` : ''}
                  </p>
                  {app.rejectionNote ? <p className="text-[14px] text-[var(--muted)]">{app.rejectionNote}</p> : null}
                  {app.status !== 'withdrawn' ? (
                    <ActionForm action={reopenAction.bind(null, id)} className="space-y-2">
                      <Field name="reason" label="Reabrir (corrigir decisão)">
                        <input id="reason" name="reason" className="input" placeholder="Fundamento obrigatório" />
                      </Field>
                      <SubmitButton className="btn btn-quiet btn-sm">Reabrir</SubmitButton>
                    </ActionForm>
                  ) : null}
                </div>
              )}
            </Section>
          ) : null}

          {can(role, 'message.view') ? (
            <Section title="Comunicações">
              <ul className="space-y-2.5">
                {messages.map((message) => (
                  <li key={message.id} className="text-[13.5px]">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-medium">{message.subject}</span>
                      <StatusBadge status={message.status} label={MESSAGE_STATUS[message.status] ?? message.status} />
                    </div>
                    <p className="text-[12.5px] text-[var(--muted)]">
                      {formatDateTime(message.sentAt ?? message.createdAt)}
                      {message.hasAttachments ? ' · com convite .ics' : ''}
                    </p>
                    {message.lastError ? <p className="text-[12.5px] text-[var(--danger)]">{message.lastError}</p> : null}
                    {message.status === 'failed' || message.status === 'dead' ? (
                      <ActionButton className="btn btn-quiet btn-sm mt-1" action={retryMessageAction.bind(null, message.id)}>
                        Reenviar
                      </ActionButton>
                    ) : null}
                  </li>
                ))}
                {messages.length === 0 ? <li className="text-[var(--muted)]">Sem mensagens.</li> : null}
              </ul>
              {can(role, 'message.send') && app.candidate.email ? (
                <details className="mt-4">
                  <summary className="cursor-pointer text-[14px] font-semibold">Pedir informação ao candidato</summary>
                  <ActionForm action={informationRequestAction.bind(null, id)} resetOnSuccess className="mt-2 space-y-2">
                    <Field name="message" label="Mensagem">
                      <textarea id="message" name="message" className="textarea" rows={4} placeholder="Ex.: Pode enviar uma cópia da carta de condução profissional?" />
                    </Field>
                    <SubmitButton className="btn btn-quiet btn-sm">Enviar</SubmitButton>
                  </ActionForm>
                </details>
              ) : null}
            </Section>
          ) : null}
        </aside>
      </div>
    </div>
  )
}
