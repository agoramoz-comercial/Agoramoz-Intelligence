import type { Metadata } from 'next'
import { requirePermission } from '@/server/auth/current'
import { listVacancies } from '@/modules/vacancies/service'
import { PageHeader } from '@/components/ui'
import { ImportForm } from './import-form'
import { importAction } from '../actions'

export const metadata: Metadata = { title: 'Importar candidatos' }

export default async function ImportPage({ searchParams }: { searchParams: Promise<{ vaga?: string }> }) {
  const ctx = await requirePermission('candidate.manage')
  const { vaga } = await searchParams
  const vacancies = await listVacancies(ctx, 'published')
  return (
    <>
      <PageHeader
        back={{ href: '/app/candidatos', label: 'Candidatos' }}
        title="Importar folha de candidatos"
        description="Migre a folha de cálculo actual sem perder histórico. Valide primeiro: o relatório mostra cada linha com erro antes de gravar. Duplicados são sugeridos, nunca eliminados."
      />
      <div className="panel p-6">
        <ImportForm action={importAction} vacancies={vacancies.map((vacancy) => ({ id: vacancy.id, title: vacancy.title }))} defaultVacancy={vaga} />
      </div>
    </>
  )
}
