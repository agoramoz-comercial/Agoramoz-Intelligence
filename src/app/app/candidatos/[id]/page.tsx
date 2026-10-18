import type { Metadata } from 'next'
import Link from 'next/link'
import { requirePermission } from '@/server/auth/current'
import { can } from '@/server/auth/rbac'
import { getCandidate } from '@/modules/candidates/service'
import { SOURCE_LABELS, type ApplicationSource } from '@/modules/applications/intake'
import { ActionButton } from '@/components/action-button'
import { ActionForm, Field, SubmitButton } from '@/components/form'
import { Badge, KeyValue, PageHeader, Section, StatusBadge } from '@/components/ui'
import { formatDate, formatDateTime } from '@/lib/format'
import { dismissDuplicateAction, eraseAction, mergeAction } from '../actions'

export const metadata: Metadata = { title: 'Candidato' }

const STATUS_LABELS: Record<string, string> = { active: 'Em processo', hired: 'Contratado', rejected: 'Não seleccionado', withdrawn: 'Retirada' }

export default async function CandidatePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission('candidate.view')
  const { id } = await params
  const { candidate, applications, files, duplicates } = await getCandidate(ctx, id)
  const manage = can(ctx.user.role, 'candidate.manage')
  const privacy = can(ctx.user.role, 'privacy.manage')
  const hasActive = applications.some((application) => application.status === 'active')
  return (
    <div className="space-y-6">
      <PageHeader
        back={{ href: '/app/candidatos', label: 'Candidatos' }}
        title={candidate.fullName}
        description={candidate.anonymizedAt ? `Anonimizado em ${formatDateTime(candidate.anonymizedAt)}` : `Registado em ${formatDate(candidate.createdAt)} · ${SOURCE_LABELS[candidate.source as ApplicationSource] ?? candidate.source}`}
        actions={
          privacy && !candidate.anonymizedAt ? (
            <a className="btn btn-quiet" href={`/api/export/candidato/${candidate.id}`}>
              Exportar dados do titular (JSON)
            </a>
          ) : null
        }
      />

      {duplicates.length > 0 ? (
        <Section title="Possíveis duplicados">
          <p className="mb-3 text-[14px] text-[var(--muted)]">Nada é fundido automaticamente. Compare e decida; a fusão move candidaturas, ficheiros e mensagens para o registo mantido.</p>
          <ul className="space-y-3">
            {duplicates.map((duplicate) => (
              <li key={duplicate.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-[var(--surface)] p-3">
                <div>
                  <Link className="link font-semibold" href={`/app/candidatos/${duplicate.otherId}`}>
                    {duplicate.otherName}
                  </Link>
                  <span className="text-[var(--muted)]"> · {duplicate.otherEmail ?? 'sem email'}</span>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {duplicate.reasons.map((reason) => (
                      <Badge key={reason} tone="info">
                        {reason}
                      </Badge>
                    ))}
                  </div>
                </div>
                {manage ? (
                  <div className="flex flex-wrap gap-2">
                    <ActionButton
                      className="btn btn-sm"
                      action={mergeAction.bind(null, candidate.id, duplicate.otherId)}
                      confirmMessage={`Fundir "${duplicate.otherName}" neste registo? A acção fica auditada e não pode ser desfeita.`}
                    >
                      Fundir neste registo
                    </ActionButton>
                    <ActionButton className="btn btn-quiet btn-sm" action={dismissDuplicateAction.bind(null, duplicate.id)}>
                      Não é a mesma pessoa
                    </ActionButton>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Section title="Candidaturas">
            <ul className="divide-y divide-[var(--grid)]">
              {applications.map((application) => (
                <li key={application.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <div>
                    <Link className="link font-medium" href={`/app/candidaturas/${application.id}`}>
                      {application.vacancyTitle}
                    </Link>
                    <p className="text-[13px] text-[var(--muted)]">
                      {application.reference} · {SOURCE_LABELS[application.source as ApplicationSource] ?? application.source} · {formatDate(application.createdAt)}
                    </p>
                  </div>
                  <span className="flex gap-1.5">
                    {application.stageName ? <Badge>{application.stageName}</Badge> : null}
                    <StatusBadge status={application.status} label={STATUS_LABELS[application.status] ?? application.status} />
                  </span>
                </li>
              ))}
            </ul>
          </Section>
          <Section title="Documentos">
            {files.length === 0 ? <p className="text-[var(--muted)]">Sem documentos.</p> : null}
            <ul className="space-y-2">
              {files.map((file) => (
                <li key={file.id} className="flex items-center justify-between gap-3 text-[14px]">
                  {file.scanStatus === 'clean' ? (
                    <a className="link" href={`/api/files/${file.id}`}>
                      {file.filename}
                    </a>
                  ) : (
                    <span>{file.filename}</span>
                  )}
                  <span className="text-[12.5px] text-[var(--muted)]">
                    {Math.ceil(file.sizeBytes / 1024)} KB · {file.scanStatus === 'clean' ? 'verificado' : file.scanStatus} · {file.hasText ? 'texto extraído' : 'sem texto'}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        </div>
        <aside className="space-y-6">
          <Section title="Dados e consentimento">
            <KeyValue
              columns={1}
              items={[
                { label: 'Email', value: candidate.email ?? '—' },
                { label: 'Telefone', value: candidate.phone ?? '—' },
                { label: 'Localidade', value: candidate.location ?? '—' },
                { label: 'Consentimento de tratamento', value: `${formatDateTime(candidate.consentProcessingAt)} (versão ${candidate.consentVersion})` },
                { label: 'Talent pool', value: candidate.consentTalentPool ? 'Autorizado' : 'Não autorizado' },
                { label: 'Contacto por WhatsApp', value: candidate.consentWhatsapp ? 'Autorizado' : 'Não autorizado' },
                { label: 'Conservar até', value: candidate.retentionUntil ? formatDate(candidate.retentionUntil) : '—' },
              ]}
            />
          </Section>
          {privacy && !candidate.anonymizedAt ? (
            <Section title="Eliminação (anonimização)">
              <p className="mb-3 text-[14px] text-[var(--muted)]">
                Remove nome, contactos, respostas, notas e ficheiros; mantém apenas factos agregados para métricas e auditoria. Irreversível.
              </p>
              {hasActive ? (
                <p className="text-[14px] text-[var(--warn)]">Existe um processo activo: encerre-o antes de anonimizar.</p>
              ) : (
                <ActionForm action={eraseAction.bind(null, candidate.id)} className="space-y-2">
                  <Field name="reason" label="Fundamento" hint="Ex.: pedido do titular de 18/10/2026.">
                    <input id="reason" name="reason" className="input" />
                  </Field>
                  <SubmitButton className="btn btn-danger">Anonimizar candidato</SubmitButton>
                </ActionForm>
              )}
            </Section>
          ) : null}
        </aside>
      </div>
    </div>
  )
}
