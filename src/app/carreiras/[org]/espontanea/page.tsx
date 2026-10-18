import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getPublicOrg } from '@/modules/organizations/public'
import { ApplyForm } from '@/components/apply-form'

export const metadata: Metadata = { title: 'Candidatura espontânea' }

export default async function SpontaneousPage({ params }: { params: Promise<{ org: string }> }) {
  const org = await getPublicOrg((await params).org)
  if (!org) notFound()
  return (
    <div className="grid grid-cols-1 gap-10 pt-8 lg:grid-cols-[1fr_460px]">
      <div>
        <h1 className="text-[40px] font-semibold leading-[1.02] tracking-[-0.03em] sm:text-[56px]">Não encontrou a vaga certa?</h1>
        <p className="mt-6 max-w-xl text-[19px] leading-relaxed">
          Deixe o seu perfil. A equipa de Recursos Humanos da {org.name} associa-o a uma vaga quando houver uma adequada, e informa-o se isso acontecer.
        </p>
        <p className="mt-4 max-w-xl text-[16px] text-[var(--muted)]">
          Se marcar a opção de futuras oportunidades, conservamos o perfil pelo prazo indicado na política de privacidade. Pode pedir a eliminação a qualquer momento.
        </p>
      </div>
      <div className="rounded-xl bg-[var(--surface)] p-5 sm:p-7">
        <ApplyForm orgSlug={org.slug} orgName={org.name} vacancySlug={null} vacancyTitle={null} questions={[]} />
      </div>
    </div>
  )
}
