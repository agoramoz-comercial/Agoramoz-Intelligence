import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPublicOrg } from '@/modules/organizations/public'
import { listPublicVacancies } from '@/modules/vacancies/service'
import { CONTRACT_LABELS } from '@/modules/requisitions/schema'
import { formatDate, formatMzn } from '@/lib/format'

export async function generateMetadata({ params }: { params: Promise<{ org: string }> }): Promise<Metadata> {
  const org = await getPublicOrg((await params).org)
  return { title: org ? `Vagas na ${org.name}` : 'Vagas' }
}

export default async function CareersPage({ params }: { params: Promise<{ org: string }> }) {
  const org = await getPublicOrg((await params).org)
  if (!org) notFound()
  const vacancies = await listPublicVacancies(org.id)
  return (
    <>
      <section className="pb-12 pt-10 sm:pt-16">
        <h1 className="lines max-w-3xl text-[44px] font-semibold leading-[1] tracking-[-0.035em] sm:text-[72px]">
          <span className="line">
            <span data-line style={{ ['--i' as string]: 0 }}>
              Trabalhe connosco.
            </span>
          </span>
          <span className="line">
            <span data-line style={{ ['--i' as string]: 1 }} className="text-[var(--muted)]">
              {vacancies.length === 1 ? 'Uma vaga aberta.' : `${vacancies.length} vagas abertas.`}
            </span>
          </span>
        </h1>
        <p className="mt-6 max-w-xl text-[18px] leading-relaxed" data-rise style={{ ['--i' as string]: 2 }}>
          Candidate-se pelo telemóvel em poucos minutos. Recebe confirmação e uma resposta, qualquer que seja o resultado.
        </p>
      </section>

      {vacancies.length === 0 ? (
        <p className="rounded-xl bg-[var(--surface)] p-6 text-[17px]">
          Neste momento não há vagas abertas. Pode deixar uma{' '}
          <Link className="link" href={`/carreiras/${org.slug}/espontanea`}>
            candidatura espontânea
          </Link>
          .
        </p>
      ) : (
        <ul className="space-y-3">
          {vacancies.map((vacancy, index) => (
            <li key={vacancy.vacancyId} data-reveal style={{ ['--i' as string]: index }}>
              <Link href={`/carreiras/${org.slug}/${vacancy.slug}`} className="group grid grid-cols-1 gap-3 rounded-xl bg-[var(--panel)] p-5 transition-colors hover:bg-[#fafbfb] sm:grid-cols-[1fr_auto] sm:p-7">
                <div>
                  <h2 className="text-[24px] font-semibold leading-tight tracking-tight sm:text-[28px]">{vacancy.title}</h2>
                  <p className="mt-2 max-w-2xl text-[16px] text-[var(--muted)]">{vacancy.summary}</p>
                </div>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-[15px] sm:w-64 sm:grid-cols-1 sm:text-right">
                  <div>
                    <dt className="sr-only">Local</dt>
                    <dd>{vacancy.location}</dd>
                  </div>
                  <div>
                    <dt className="sr-only">Contrato</dt>
                    <dd>{CONTRACT_LABELS[vacancy.contractType as keyof typeof CONTRACT_LABELS]}</dd>
                  </div>
                  {vacancy.salaryVisible && vacancy.salaryMax ? (
                    <div>
                      <dt className="sr-only">Salário</dt>
                      <dd>até {formatMzn(vacancy.salaryMax)}</dd>
                    </div>
                  ) : null}
                  <div>
                    <dt className="sr-only">Prazo</dt>
                    <dd className="text-[var(--muted)]">{vacancy.closesOn ? `Até ${formatDate(vacancy.closesOn)}` : 'Candidaturas abertas'}</dd>
                  </div>
                </dl>
                <span className="text-[16px] font-semibold text-[var(--accent)] group-hover:underline sm:col-span-2">Ver vaga e candidatar →</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
