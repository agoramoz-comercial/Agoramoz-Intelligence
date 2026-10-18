import Link from 'next/link'

export default function NoAccessPage() {
  return (
    <div className="panel max-w-xl p-8">
      <h1 className="text-xl font-semibold">Sem acesso a esta área</h1>
      <p className="mt-2 text-[var(--muted)]">
        O seu papel não inclui esta funcionalidade. O acesso segue o princípio de necessidade de conhecer: peça ao administrador da sua empresa se precisar.
      </p>
      <Link className="btn mt-6" href="/app">
        Voltar ao início
      </Link>
    </div>
  )
}
