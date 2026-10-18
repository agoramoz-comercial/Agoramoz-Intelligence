import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getPublicOrg } from '@/modules/organizations/public'
import { getPublicVacancy } from '@/modules/vacancies/service'
import { CONTRACT_LABELS } from '@/modules/requisitions/schema'
import { ApplyForm } from '@/components/apply-form'
import { PlainRichText } from '@/components/rich-text'
import { formatDate, formatMzn } from '@/lib/format'

async function load(params: Promise<{ org: string; slug: string }>) {
  const { org: orgSlug, slug } = await params
  const org = await getPublicOrg(orgSlug)
  if (!org) return null
  const vacancy = await getPublicVacancy(org.id, slug)
  return vacancy ? { org, vacancy } : null
}

export async function generateMetadata({ params }: { params: Promise<{ org: string; slug: string }> }): Promise<Metadata> {
  const data = await load(params)
  return data ? { title: `${data.vacancy.title} · ${data.org.name}`, description: data.vacancy.summary } : { title: 'Vaga' }
}

export default async function VacancyPublicPage({ params }: { params: Promise<{ org: string; slug: string }> }) {
  const data = await load(params)
  if (!data) notFound()
  const { org, vacancy } = data
  const must = vacancy.requirements.filter((item) => item.kind === 'must')
  const nice = vacancy.requirements.filter((item) => item.kind === 'nice')
  return (
    <article className="grid grid-cols-1 gap-10 pt-8 lg:grid-cols-[1fr_420px] lg:gap-14">
      <div>
        <h1 className="text-[40px] font-semibold leading-[1.02] tracking-[-0.03em] sm:text-[56px]" data-rise>
          {vacancy.title}
        </h1>
        <dl className="mt-5 flex flex-wrap gap-x-6 gap-y-1 text-[16px]" data-rise style={{ ['--i' as string]: 1 }}>
          <div>
            <dt className="sr-only">Local</dt>
            <dd>{vacancy.location}</dd>
          </div>
          <div>
            <dt className="sr-only">Contrato</dt>
            <dd>{CONTRACT_LABELS[vacancy.contractType as keyof typeof CONTRACT_LABELS]}</dd>
          </div>
          {vacancy.salaryVisible && (vacancy.salaryMin || vacancy.salaryMax) ? (
            <div>
              <dt className="sr-only">Salário mensal</dt>
              <dd>
                {formatMzn(vacancy.salaryMin)} – {formatMzn(vacancy.salaryMax)} / mês
              </dd>
            </div>
          ) : null}
          <div>
            <dt className="sr-only">Prazo</dt>
            <dd className="text-[var(--muted)]">{vacancy.closesOn ? `Candidaturas até ${formatDate(vacancy.closesOn)}` : `Publicada em ${formatDate(vacancy.publishedAt)}`}</dd>
          </div>
        </dl>
        <p className="mt-6 max-w-2xl text-[20px] leading-snug" data-rise style={{ ['--i' as string]: 2 }}>
          {vacancy.summary}
        </p>
        <a href="#candidatar" className="btn mt-6 min-h-12 px-8 text-[16px] lg:hidden">
          Candidatar-me
        </a>
        <div className="mt-10">
          <PlainRichText text={vacancy.description} />
        </div>
        <section className="mt-10 rounded-xl bg-[var(--panel)] p-6" data-reveal>
          <h2 className="text-[22px] font-semibold">O que procuramos</h2>
          <ul className="mt-3 space-y-2 text-[17px]">
            {must.map((item) => (
              <li key={item.id} className="flex gap-3">
                <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[var(--accent)]" aria-hidden="true" />
                <span>{item.text}</span>
              </li>
            ))}
          </ul>
          {nice.length ? (
            <>
              <h3 className="mt-5 text-[17px] font-semibold">Valorizamos também</h3>
              <ul className="mt-2 space-y-1.5 text-[16px] text-[var(--muted)]">
                {nice.map((item) => (
                  <li key={item.id}>{item.text}</li>
                ))}
              </ul>
            </>
          ) : null}
          <p className="mt-5 text-[15px] text-[var(--muted)]">
            Todas as candidaturas são lidas por pessoas. Não usamos pontuações automáticas nem decisões automáticas de rejeição.
          </p>
        </section>
      </div>
      <aside id="candidatar" className="lg:sticky lg:top-6 lg:self-start">
        <div className="rounded-xl bg-[var(--surface)] p-5 sm:p-7">
          <h2 className="mb-6 text-[26px] font-semibold leading-tight tracking-tight">Candidatar-me</h2>
          <ApplyForm
            orgSlug={org.slug}
            orgName={org.name}
            vacancySlug={vacancy.slug}
            vacancyTitle={vacancy.title}
            questions={vacancy.screeningQuestions.map(({ id, text, kind, required }) => ({ id, text, kind, required }))}
          />
        </div>
      </aside>
    </article>
  )
}
