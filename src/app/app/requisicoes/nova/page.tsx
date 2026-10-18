import type { Metadata } from 'next'
import { requirePermission } from '@/server/auth/current'
import { listDepartments } from '@/modules/users/service'
import { PageHeader } from '@/components/ui'
import { RequisitionForm } from '../requisition-form'
import { createRequisitionAction } from '../actions'

export const metadata: Metadata = { title: 'Nova requisição' }

export default async function NewRequisitionPage() {
  const ctx = await requirePermission('requisition.create')
  const departments = await listDepartments(ctx)
  return (
    <>
      <PageHeader
        title="Nova requisição de vaga"
        back={{ href: '/app/requisicoes', label: 'Requisições' }}
        description="Justifique a necessidade e defina critérios verificáveis. A vaga só é publicada depois de aprovada pela matriz da empresa."
      />
      <div className="panel p-6">
        <RequisitionForm action={createRequisitionAction} departments={departments} submitLabel="Guardar rascunho" />
      </div>
    </>
  )
}
