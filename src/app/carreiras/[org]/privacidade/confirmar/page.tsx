import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPublicOrg } from '@/modules/organizations/public'
import { ActionButton } from '@/components/action-button'
import { confirmPrivacyAction } from '../actions'

export const metadata: Metadata = { title: 'Confirmar pedido' }

/** A confirmação exige um clique (POST): leitores automáticos de ligações não consomem o token. */
export default async function ConfirmDsrPage({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ token?: string }> }) {
  const org = await getPublicOrg((await params).org)
  if (!org) notFound()
  const { token } = await searchParams
  return (
    <div className="max-w-2xl pt-10">
      <h1 className="text-[40px] font-semibold leading-tight tracking-tight">Confirmar o seu pedido</h1>
      {token ? (
        <>
          <p className="mt-4 text-[18px]">Confirme que fez este pedido sobre os seus dados na {org.name}.</p>
          <div className="mt-6">
            <ActionButton className="btn min-h-12 px-8 text-[16px]" action={confirmPrivacyAction.bind(null, org.slug, token)}>
              Confirmar pedido
            </ActionButton>
          </div>
        </>
      ) : (
        <p className="mt-4 text-[18px]">
          Ligação incompleta.{' '}
          <Link className="link" href={`/carreiras/${org.slug}/privacidade`}>
            Faça um novo pedido
          </Link>
          .
        </p>
      )}
    </div>
  )
}
