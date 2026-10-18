import type { Metadata } from 'next'
import Link from 'next/link'
import { requirePermission } from '@/server/auth/current'
import { can } from '@/server/auth/rbac'
import { listMessages, listTemplates, messageCounts } from '@/modules/communications/service'
import { TEMPLATE_LABELS, TEMPLATE_VARIABLES } from '@/modules/communications/defaults'
import { ActionButton } from '@/components/action-button'
import { ActionForm, Field, SubmitButton } from '@/components/form'
import { EmptyState, PageHeader, Section, StatusBadge } from '@/components/ui'
import { formatDateTime } from '@/lib/format'
import { retryAction, templateAction } from './actions'

export const metadata: Metadata = { title: 'Mensagens' }

const STATUS = { queued: 'Em fila', sending: 'A enviar', sent: 'Entregue', failed: 'Falhou (nova tentativa)', dead: 'Esgotada' } as const

export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ estado?: string }> }) {
  const ctx = await requirePermission('message.view')
  const { estado } = await searchParams
  const status = estado && estado in STATUS ? estado : undefined
  const [messages, counts, templates] = await Promise.all([
    listMessages(ctx, { status }),
    messageCounts(ctx),
    can(ctx.user.role, 'template.manage') ? listTemplates(ctx) : Promise.resolve([]),
  ])
  return (
    <div className="space-y-6">
      <PageHeader
        title="Mensagens aos candidatos"
        description="Cada mensagem tem estado visível. Falhas são repetidas automaticamente (1, 5, 30 e 120 min) e podem ser reenviadas manualmente."
      />
      <nav aria-label="Filtrar por estado" className="flex flex-wrap gap-2">
        <Link className={`btn btn-sm ${!status ? '' : 'btn-quiet'}`} href="/app/mensagens">
          Todas
        </Link>
        {Object.entries(STATUS).map(([value, label]) => (
          <Link key={value} className={`btn btn-sm ${status === value ? '' : 'btn-quiet'}`} href={`/app/mensagens?estado=${value}`}>
            {label} ({counts[value] ?? 0})
          </Link>
        ))}
      </nav>
      {messages.length === 0 ? (
        <EmptyState title="Sem mensagens neste filtro" />
      ) : (
        <div className="panel overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Mensagem</th>
                <th>Destinatário</th>
                <th>Estado</th>
                <th>Quando</th>
              </tr>
            </thead>
            <tbody>
              {messages.map((message) => (
                <tr key={message.id}>
                  <td className="max-w-md">
                    <details>
                      <summary className="cursor-pointer font-medium">{message.subject}</summary>
                      <pre className="mt-2 whitespace-pre-wrap font-sans text-[13.5px] text-[var(--muted)]">{message.body}</pre>
                    </details>
                    {message.applicationId ? (
                      <Link className="link text-[13px]" href={`/app/candidaturas/${message.applicationId}`}>
                        Ver candidatura
                      </Link>
                    ) : null}
                  </td>
                  <td className="text-[13.5px]">
                    {message.candidateName ?? '—'}
                    <div className="text-[var(--muted)]">{message.toAddress}</div>
                  </td>
                  <td>
                    <StatusBadge status={message.status} label={STATUS[message.status]} />
                    {message.lastError ? <p className="mt-1 max-w-56 text-[12.5px] text-[var(--danger)]">{message.lastError}</p> : null}
                    {(message.status === 'failed' || message.status === 'dead') && can(ctx.user.role, 'message.send') ? (
                      <div className="mt-1">
                        <ActionButton className="btn btn-quiet btn-sm" action={retryAction.bind(null, message.id)}>
                          Reenviar
                        </ActionButton>
                      </div>
                    ) : null}
                  </td>
                  <td className="nums whitespace-nowrap text-[13.5px]">
                    {formatDateTime(message.sentAt ?? message.createdAt)}
                    <div className="text-[var(--muted)]">{message.attempts} tentativa(s)</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {templates.length > 0 ? (
        <Section title="Modelos de mensagem">
          <p className="mb-4 text-[14px] text-[var(--muted)]">
            Variáveis disponíveis: {TEMPLATE_VARIABLES.map((variable) => `{{${variable}}}`).join(' ')}. As alterações aplicam-se às próximas mensagens.
          </p>
          <div className="space-y-3">
            {templates.map((template) => (
              <details key={template.key} className="rounded-lg bg-[var(--surface)] p-3">
                <summary className="cursor-pointer font-semibold">{TEMPLATE_LABELS[template.key]}</summary>
                <ActionForm action={templateAction.bind(null, template.key)} className="mt-3 space-y-3">
                  <Field name="subject" label="Assunto">
                    <input id="subject" name="subject" className="input" defaultValue={template.subject} />
                  </Field>
                  <Field name="body" label="Texto">
                    <textarea id="body" name="body" className="textarea" rows={10} defaultValue={template.body} />
                  </Field>
                  <SubmitButton className="btn btn-quiet btn-sm">Guardar modelo</SubmitButton>
                </ActionForm>
              </details>
            ))}
          </div>
        </Section>
      ) : null}
    </div>
  )
}
