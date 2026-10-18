import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ActionForm, Field, SubmitButton } from '@/components/form'
import { currentUser } from '@/server/auth/current'
import { loginAction } from './actions'

export const metadata: Metadata = { title: 'Entrar' }

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await currentUser()) redirect('/app')
  const { next } = await searchParams
  return (
    <main className="grid min-h-svh lg:grid-cols-2">
      <section className="flex flex-col justify-between bg-[var(--navy)] p-8 text-[var(--navy-ink)] lg:p-12">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          AGORAMOZ HR
        </Link>
        <div className="max-w-md py-16">
          <p className="text-3xl font-semibold leading-tight tracking-tight lg:text-4xl">Um processo. Todos os candidatos. Decisões com evidência.</p>
          <p className="mt-4 text-[var(--navy-muted)]">
            Candidaturas do formulário, email, WhatsApp e folhas de cálculo num único fluxo auditado — sem obrigar ninguém a abandonar os canais que já usa.
          </p>
        </div>
        <p className="text-sm text-[var(--navy-muted)]">Dados protegidos por isolamento por empresa, registo de auditoria e exportação a qualquer momento.</p>
      </section>
      <section className="flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-semibold">Entrar</h1>
          <p className="mt-1 text-[var(--muted)]">Use a conta criada pela administração da sua empresa.</p>
          <ActionForm action={loginAction} className="mt-8 space-y-5">
            <input type="hidden" name="next" value={next ?? ''} />
            <Field name="email" label="Email">
              <input id="email" name="email" type="email" autoComplete="username" required className="input" />
            </Field>
            <Field name="password" label="Palavra-passe">
              <input id="password" name="password" type="password" autoComplete="current-password" required className="input" />
            </Field>
            <SubmitButton className="btn w-full" pendingLabel="A verificar…">
              Entrar
            </SubmitButton>
          </ActionForm>
          <p className="mt-6 text-sm text-[var(--muted)]">
            Esqueceu a palavra-passe? Peça ao administrador da sua empresa para a redefinir.
          </p>
        </div>
      </section>
    </main>
  )
}
