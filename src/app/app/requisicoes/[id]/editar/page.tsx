import type { Metadata } from 'next'
import { requirePermission } from '@/server/auth/current'
import { getRequisition } from '@/modules/requisitions/service'
import { listDepartments } from '@/modules/users/service'
import { PageHeader } from '@/components/ui'
import { RequisitionForm } from '../../requisition-form'
import { updateRequisitionAction } from '../../actions'

export const metadata: Metadata = { title: 'Editar requisição' }

export default async function EditRequisitionPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission('requisition.create')
  const { id } = await params
  const [{ requisition: r }, departments] = await Promise.all([getRequisition(ctx, id), listDepartments(ctx)])
  return (
    <>
      <PageHeader title={`Editar ${r.code}`} back={{ href: `/app/requisicoes/${id}`, label: r.title }} description="Editar volta a requisição a rascunho; terá de a submeter de novo." />
      <div className="panel p-6">
        <RequisitionForm
          action={updateRequisitionAction.bind(null, id)}
          departments={departments}
          submitLabel="Guardar alterações"
          defaults={{
            title: r.title,
            departmentId: r.departmentId,
            location: r.location,
            contractType: r.contractType,
            headcount: r.headcount,
            salaryMin: r.salaryMin ? String(Number(r.salaryMin)) : '',
            salaryMax: r.salaryMax ? String(Number(r.salaryMax)) : '',
            reason: r.reason,
            justification: r.justification,
            requirementsMust: r.requirements.filter((item) => item.kind === 'must').map((item) => item.text).join('\n'),
            requirementsNice: r.requirements.filter((item) => item.kind === 'nice').map((item) => item.text).join('\n'),
            competencies: r.competencies.map((item) => `${item.name}: ${item.description}`).join('\n'),
          }}
        />
      </div>
    </>
  )
}
