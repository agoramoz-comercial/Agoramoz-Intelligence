import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPublicOrg } from '@/modules/organizations/public'

export default async function CareersLayout({ children, params }: { children: React.ReactNode; params: Promise<{ org: string }> }) {
  const { org: slug } = await params
  const org = await getPublicOrg(slug)
  if (!org) notFound()
  return (
    <div className="min-h-svh bg-[var(--bg)]">
      <header className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-5 sm:px-6">
        <Link href={`/carreiras/${org.slug}`} className="text-[18px] font-semibold tracking-tight">
          {org.name}
        </Link>
        <nav aria-label="Carreiras" className="flex gap-5 text-[15px]">
          <Link className="link text-[var(--ink)]" href={`/carreiras/${org.slug}`}>
            Vagas
          </Link>
          <Link className="link text-[var(--ink)]" href={`/carreiras/${org.slug}/espontanea`}>
            Candidatura espontânea
          </Link>
          <Link className="link text-[var(--ink)]" href={`/carreiras/${org.slug}/privacidade`}>
            Privacidade
          </Link>
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-4 pb-20 sm:px-6">{children}</main>
      <footer className="mx-auto grid max-w-5xl grid-cols-1 gap-2 px-4 pb-8 text-[14px] text-[var(--muted)] sm:grid-cols-[1fr_auto_1fr] sm:px-6">
        <span>Recrutamento de {org.name}</span>
        <Link className="link text-[var(--ink)]" href={`/carreiras/${org.slug}/privacidade`}>
          Os seus dados
        </Link>
        <span className="sm:text-right">
          Com <Link className="link text-[var(--ink)]" href="/">AGORAMOZ HR</Link>
        </span>
      </footer>
    </div>
  )
}
