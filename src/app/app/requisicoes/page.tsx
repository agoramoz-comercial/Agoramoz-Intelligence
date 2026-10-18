import type { Metadata } from 'next'
import Link from 'next/link'
import { requirePermission } from '@/server/auth/current'
import { can } from '@/server/auth/rbac'
import { listRequisitions } from '@/modules/requisitions/service'
import { CONTRACT_LABELS, REQUISITION_STATUS_LABELS } from '@/modules/requisitions/schema'
import { EmptyState, PageHeader, StatusBadge } from '@/components/ui'
import { formatDate, formatMzn } from '@/lib/format'

export const metadata: Metadata = { title: 'Requisições' }

const FILTERS = [
  { value: '', label: 'Todas' },
  { value: 'pending_approval', label: 'Em aprovação' },
  { value: 'draft', label: 'Rascunhos' },
  { value: 'approved', label: 'Aprovadas' },
  { value: 'rejected', label: 'Rejeitadas' },
]

export default async function RequisitionsPage({ searchParams }: { searchParams: Promise<{ estado?: string }> }) {
  const ctx = await requirePermission('requisition.view')
  const { estado } = await searchParams
  const status = FILTERS.some((filter) => filter.value === estado) ? estado : ''
  const rows = await listRequisitions(ctx, status || undefined)
  return (
    <>
      <PageHeader
        title="Requisições"
        description="Cada vaga nasce de uma requisição justificada e aprovada pela matriz da empresa. Nenhuma vaga pública sem aprovação."
        actions={
          can(ctx.user.role, 'requisition.create') ? (
            <Link className="btn" href="/app/requisicoes/nova">
              Nova requisição
            </Link>
          ) : null
        }
      />
      <nav aria-label="Filtrar por estado" className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((filter) => (
          <Link
            key={filter.value}
            href={filter.value ? `/app/requisicoes?estado=${filter.value}` : '/app/requisicoes'}
            aria-current={status === filter.value ? 'page' : undefined}
            className={`btn btn-sm ${status === filter.value ? '' : 'btn-quiet'}`}
          >
            {filter.label}
          </Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <EmptyState title="Sem requisições neste filtro" />
      ) : (
        <div className="panel overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Função</th>
                <th>Departamento</th>
                <th>Contrato</th>
                <th className="text-right">Tecto salarial</th>
                <th>Requisitante</th>
                <th>Estado</th>
                <th>Criada</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="nums font-semibold">{row.code}</td>
                  <td>
                    <Link className="link font-medium" href={`/app/requisicoes/${row.id}`}>
                      {row.title}
                    </Link>
                    <div className="text-[13px] text-[var(--muted)]">
                      {row.location} · {row.headcount} vaga(s)
                    </div>
                  </td>
                  <td>{row.departmentName ?? '—'}</td>
                  <td>{CONTRACT_LABELS[row.contractType as keyof typeof CONTRACT_LABELS]}</td>
                  <td className="nums text-right">{formatMzn(row.salaryMax)}</td>
                  <td>{row.requesterName}</td>
                  <td>
                    <StatusBadge status={row.status} label={REQUISITION_STATUS_LABELS[row.status] ?? row.status} />
                  </td>
                  <td className="nums whitespace-nowrap">{formatDate(row.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
