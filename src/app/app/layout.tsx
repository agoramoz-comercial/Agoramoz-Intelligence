import Link from 'next/link'
import { requireUser } from '@/server/auth/current'
import { can, ROLE_LABELS, type Permission } from '@/server/auth/rbac'
import { withTenant } from '@/server/db/client'
import { SideNav, type NavItem } from '@/components/nav'
import { logoutAction } from '@/app/entrar/actions'
import { pendingApprovalsFor } from '@/modules/requisitions/service'

const NAV: { href: string; label: string; permission: Permission }[] = [
  { href: '/app', label: 'Painel', permission: 'dashboard.view' },
  { href: '/app/requisicoes', label: 'Requisições', permission: 'requisition.view' },
  { href: '/app/vagas', label: 'Vagas e pipeline', permission: 'vacancy.view' },
  { href: '/app/candidatos', label: 'Candidatos', permission: 'candidate.view' },
  { href: '/app/entrevistas', label: 'As minhas entrevistas', permission: 'interview.view_assigned' },
  { href: '/app/mensagens', label: 'Mensagens', permission: 'message.view' },
  { href: '/app/privacidade', label: 'Privacidade', permission: 'privacy.manage' },
  { href: '/app/auditoria', label: 'Auditoria', permission: 'audit.view' },
  { href: '/app/definicoes', label: 'Definições', permission: 'org.manage' },
]

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireUser()
  const [org] = await withTenant(ctx.tenantId, (tx) => tx<{ name: string; slug: string }[]>`select name, slug from organizations where id = ${ctx.tenantId}`)
  const approvals = (await pendingApprovalsFor(ctx)).length
  const items: NavItem[] = NAV.filter((item) => can(ctx.user.role, item.permission)).map((item) => ({
    href: item.href,
    label: item.label,
    badge: item.href === '/app/requisicoes' && approvals > 0 ? approvals : undefined,
  }))
  const sidebar = (
    <div className="flex h-full flex-col gap-6 p-4">
      <div className="px-3 pt-2">
        <Link href="/app" className="block text-[17px] font-semibold tracking-tight text-white">
          AGORAMOZ HR
        </Link>
        <p className="mt-0.5 truncate text-[13px] text-[var(--navy-muted)]" title={org?.name}>
          {org?.name}
        </p>
      </div>
      <SideNav items={items} />
      <div className="mt-auto space-y-3 px-3 pb-2 text-[13px] text-[var(--navy-muted)]">
        {org ? (
          <a className="block hover:text-white" href={`/carreiras/${org.slug}`} target="_blank" rel="noreferrer">
            Ver página de carreiras ↗
          </a>
        ) : null}
        <div>
          <p className="font-semibold text-white">{ctx.user.fullName}</p>
          <p>{ROLE_LABELS[ctx.user.role]}</p>
        </div>
        <form action={logoutAction}>
          <button type="submit" className="text-[13px] font-medium text-white underline-offset-4 hover:underline">
            Terminar sessão
          </button>
        </form>
      </div>
    </div>
  )
  return (
    <div className="min-h-svh lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="hidden bg-[var(--navy)] lg:block">
        <div className="lg:sticky lg:top-0 lg:h-svh">{sidebar}</div>
      </aside>
      <details className="group bg-[var(--navy)] lg:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-white">
          <span className="font-semibold">AGORAMOZ HR</span>
          <span className="text-sm text-[var(--navy-muted)]">Menu</span>
        </summary>
        {sidebar}
      </details>
      <main id="conteudo" className="min-w-0 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
        {children}
      </main>
    </div>
  )
}
