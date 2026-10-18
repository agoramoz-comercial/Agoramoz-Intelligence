import type { Metadata } from 'next'
import Link from 'next/link'
import { requirePermission } from '@/server/auth/current'
import { listVacancies } from '@/modules/vacancies/service'
import { VACANCY_STATUS_LABELS } from '@/modules/vacancies/schema'
import { EmptyState, PageHeader, StatusBadge } from '@/components/ui'
import { formatDate } from '@/lib/format'

export const metadata: Metadata = { title: 'Vagas' }

export default async function VacanciesPage() {
  const ctx = await requirePermission('vacancy.view')
  const vacancies = await listVacancies(ctx)
  return (
    <>
      <PageHeader title="Vagas e pipeline" description="Vagas criadas a partir de requisições aprovadas. Abra uma vaga para gerir o pipeline de candidatos." />
      {vacancies.length === 0 ? (
        <EmptyState title="Ainda não há vagas">Crie uma vaga a partir de uma requisição aprovada.</EmptyState>
      ) : (
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {vacancies.map((vacancy, index) => (
            <li key={vacancy.id} data-reveal style={{ ['--i' as string]: index }}>
              <Link href={`/app/vagas/${vacancy.id}`} className="panel flex h-full flex-col gap-3 p-5 transition-colors hover:bg-[#fafbfb]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[17px] font-semibold">{vacancy.title}</p>
                    <p className="text-[13.5px] text-[var(--muted)]">
                      {vacancy.requisitionCode} · {vacancy.location} · responsável {vacancy.ownerName}
                    </p>
                  </div>
                  <StatusBadge status={vacancy.status} label={VACANCY_STATUS_LABELS[vacancy.status] ?? vacancy.status} />
                </div>
                <dl className="mt-auto grid grid-cols-4 gap-2 text-[13px]">
                  <div>
                    <dt className="text-[var(--muted)]">Activas</dt>
                    <dd className="nums text-[20px] font-semibold">{vacancy.activeCount}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--muted)]">Novas</dt>
                    <dd className="nums text-[20px] font-semibold">{vacancy.newCount}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--muted)]">Contratados</dt>
                    <dd className="nums text-[20px] font-semibold">
                      {vacancy.hiredCount}/{vacancy.headcount}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[var(--muted)]">Publicada</dt>
                    <dd className="nums">{formatDate(vacancy.publishedAt)}</dd>
                  </div>
                </dl>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
