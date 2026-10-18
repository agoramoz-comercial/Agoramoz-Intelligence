import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { withTenant } from '@/server/db/client'
import { getPublicOrg } from '@/modules/organizations/public'
import { loadSettings } from '@/modules/organizations/settings'
import { DSR_KINDS } from '@/modules/privacy/service'
import { ActionForm, Field, SubmitButton } from '@/components/form'
import { requestPrivacyAction } from './actions'

export const metadata: Metadata = { title: 'Os seus dados' }

export default async function PrivacyPublicPage({ params }: { params: Promise<{ org: string }> }) {
  const org = await getPublicOrg((await params).org)
  if (!org) notFound()
  const settings = await withTenant(org.id, (tx) => loadSettings(tx, org.id))
  return (
    <div className="grid grid-cols-1 gap-10 pt-8 lg:grid-cols-[1fr_440px]">
      <div className="space-y-6 text-[17px] leading-relaxed">
        <h1 className="text-[40px] font-semibold leading-[1.02] tracking-[-0.03em] sm:text-[56px]">Os seus dados, explicados</h1>
        <p className="max-w-2xl text-[19px]">Quando se candidata à {org.name}, os seus dados servem apenas para avaliar a candidatura e comunicar consigo.</p>
        <section>
          <h2 className="text-[22px] font-semibold">O que recolhemos</h2>
          <p className="max-w-[65ch]">Nome, contactos, localidade, CV, respostas às perguntas da vaga e o registo das etapas e decisões do processo. Não pedimos dados sensíveis.</p>
        </section>
        <section>
          <h2 className="text-[22px] font-semibold">Quanto tempo guardamos</h2>
          <p className="max-w-[65ch]">
            {settings.retentionMonths} meses após a decisão do processo. Se autorizar futuras oportunidades, {settings.talentPoolMonths} meses. Depois disso os dados são anonimizados.
          </p>
        </section>
        <section>
          <h2 className="text-[22px] font-semibold">Como decidimos</h2>
          <p className="max-w-[65ch]">As decisões são tomadas por pessoas, com critérios definidos antes da publicação da vaga. Ferramentas automáticas apenas ajudam a organizar a informação.</p>
        </section>
        <section>
          <h2 className="text-[22px] font-semibold">Os seus direitos</h2>
          <p className="max-w-[65ch]">
            Pode pedir acesso, cópia, correcção, oposição ou eliminação. Respondemos no prazo de 30 dias.
            {settings.privacyContactEmail ? ` Contacto directo: ${settings.privacyContactEmail}.` : ''}
          </p>
        </section>
      </div>
      <div className="rounded-xl bg-[var(--surface)] p-5 sm:p-7 lg:self-start">
        <h2 className="mb-5 text-[24px] font-semibold">Fazer um pedido</h2>
        <ActionForm action={requestPrivacyAction.bind(null, org.slug)} resetOnSuccess className="space-y-4">
          <Field name="email" label="Email usado na candidatura">
            <input id="email" name="email" type="email" autoComplete="email" className="input min-h-12 text-[17px]" />
          </Field>
          <Field name="kind" label="O que pretende">
            <select id="kind" name="kind" className="select min-h-12 text-[16px]" defaultValue="access">
              {Object.entries(DSR_KINDS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field name="details" label="Detalhes (opcional)">
            <textarea id="details" name="details" className="textarea text-[16px]" rows={3} />
          </Field>
          <SubmitButton className="btn min-h-12 w-full text-[16px]" pendingLabel="A registar…">
            Enviar pedido
          </SubmitButton>
          <p className="text-[14px] text-[var(--muted)]">Para proteger os seus dados, confirmamos o pedido por email antes de o tratar.</p>
        </ActionForm>
      </div>
    </div>
  )
}
