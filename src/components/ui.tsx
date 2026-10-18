import Link from 'next/link'
import type { ReactNode } from 'react'

export function PageHeader({ title, description, actions, back }: { title: string; description?: ReactNode; actions?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {back ? (
          <Link href={back.href} className="link mb-2 inline-block text-sm">
            ← {back.label}
          </Link>
        ) : null}
        <h1 className="text-[26px] font-semibold leading-tight">{title}</h1>
        {description ? <div className="mt-1 max-w-3xl text-[var(--muted)]">{description}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </header>
  )
}

export function Section({ title, children, actions, className = '' }: { title?: string; children: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <section className={`panel p-5 ${className}`}>
      {title || actions ? (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title ? <h2 className="text-[16px] font-semibold">{title}</h2> : <span />}
          {actions}
        </div>
      ) : null}
      {children}
    </section>
  )
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-lg bg-[var(--surface)] px-5 py-8 text-center">
      <p className="font-semibold">{title}</p>
      {children ? <div className="mx-auto mt-1 max-w-md text-sm text-[var(--muted)]">{children}</div> : null}
    </div>
  )
}

type Tone = 'ok' | 'warn' | 'danger' | 'info' | 'neutral'

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`badge ${tone === 'neutral' ? '' : `badge-${tone}`}`}>{children}</span>
}

const STATUS_TONES: Record<string, Tone> = {
  draft: 'neutral',
  pending_approval: 'warn',
  approved: 'ok',
  rejected: 'danger',
  cancelled: 'neutral',
  published: 'ok',
  closed: 'neutral',
  active: 'info',
  hired: 'ok',
  withdrawn: 'neutral',
  queued: 'neutral',
  sending: 'info',
  sent: 'ok',
  failed: 'warn',
  dead: 'danger',
  scheduled: 'info',
  completed: 'ok',
  open: 'warn',
  unverified: 'neutral',
}

export function StatusBadge({ status, label }: { status: string; label: string }) {
  return <Badge tone={STATUS_TONES[status] ?? 'neutral'}>{label}</Badge>
}

export function KeyValue({ items, columns = 2 }: { items: { label: string; value: ReactNode }[]; columns?: 1 | 2 }) {
  return (
    <dl className={`grid grid-cols-1 gap-x-6 gap-y-3 ${columns === 2 ? 'sm:grid-cols-2' : ''}`}>
      {items.map((item) => (
        <div key={item.label}>
          <dt className="text-[12.5px] font-semibold text-[var(--muted)]">{item.label}</dt>
          <dd className="mt-0.5 break-words">{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}

export function Pagination({ page, total, pageSize, hrefFor }: { page: number; total: number; pageSize: number; hrefFor: (page: number) => string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  if (pages <= 1) return null
  return (
    <nav aria-label="Paginação" className="mt-4 flex items-center gap-3 text-sm">
      {page > 1 ? (
        <Link className="btn btn-quiet btn-sm" href={hrefFor(page - 1)}>
          Anterior
        </Link>
      ) : null}
      <span className="text-[var(--muted)]">
        Página {page} de {pages}
      </span>
      {page < pages ? (
        <Link className="btn btn-quiet btn-sm" href={hrefFor(page + 1)}>
          Seguinte
        </Link>
      ) : null}
    </nav>
  )
}
