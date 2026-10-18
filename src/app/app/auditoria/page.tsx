import type { Metadata } from 'next'
import { requirePermission } from '@/server/auth/current'
import { can } from '@/server/auth/rbac'
import { searchAudit } from '@/modules/audit/service'
import { EmptyState, PageHeader, Pagination } from '@/components/ui'
import { formatDateTime } from '@/lib/format'

export const metadata: Metadata = { title: 'Auditoria' }

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requirePermission('audit.view')
  const params = await searchParams
  const page = Number(params.pagina ?? 1) || 1
  const filters = { q: params.q?.slice(0, 100), action: params.accao?.slice(0, 40), from: params.de, to: params.ate, page }
  const { rows, total, pageSize, actions } = await searchAudit(ctx, filters)
  const search = (extra: Record<string, string>) =>
    new URLSearchParams(Object.entries({ ...params, ...extra }).filter(([, value]) => value) as [string, string][]).toString()
  return (
    <>
      <PageHeader
        title="Registo de auditoria"
        description="Imutável: nenhum utilizador pode alterar ou apagar eventos. Datas em hora de Maputo; armazenadas em UTC. Sem dados pessoais em claro."
        actions={
          can(ctx.user.role, 'audit.export') ? (
            <a className="btn btn-quiet" href={`/api/export/auditoria?${search({ pagina: '' })}`}>
              Exportar CSV
            </a>
          ) : null
        }
      />
      <form method="get" className="panel mb-4 grid grid-cols-1 gap-3 p-4 md:grid-cols-[2fr_1fr_1fr_1fr_auto]">
        <label className="text-[12.5px] font-semibold">
          Pesquisar resumo, ID ou correlation ID
          <input name="q" defaultValue={params.q} className="input mt-1" />
        </label>
        <label className="text-[12.5px] font-semibold">
          Área
          <select name="accao" defaultValue={params.accao ?? ''} className="select mt-1">
            <option value="">Todas</option>
            {actions.map((action) => (
              <option key={action} value={action}>
                {action}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[12.5px] font-semibold">
          De
          <input type="date" name="de" defaultValue={params.de} className="input mt-1" />
        </label>
        <label className="text-[12.5px] font-semibold">
          Até
          <input type="date" name="ate" defaultValue={params.ate} className="input mt-1" />
        </label>
        <div className="flex items-end">
          <button className="btn" type="submit">
            Filtrar
          </button>
        </div>
      </form>
      <p className="mb-2 text-[13px] text-[var(--muted)]">{total} evento(s)</p>
      {rows.length === 0 ? (
        <EmptyState title="Sem eventos para estes filtros" />
      ) : (
        <div className="panel overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Quando</th>
                <th>Actor</th>
                <th>Acção</th>
                <th>Resumo</th>
                <th>Origem</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="nums whitespace-nowrap text-[13px]">{formatDateTime(row.occurredAt)}</td>
                  <td className="text-[13.5px]">{row.actorName ?? (row.actorType === 'candidate' ? 'Candidato' : 'Sistema')}</td>
                  <td>
                    <code className="text-[12.5px]">{row.action}</code>
                  </td>
                  <td className="text-[13.5px]">
                    {row.summary}
                    {row.reason ? <span className="block text-[var(--muted)]">Fundamento: {row.reason}</span> : null}
                    {Object.keys(row.changes).length > 0 ? (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-[12.5px] text-[var(--muted)]">Alterações</summary>
                        <pre className="mt-1 max-w-lg overflow-x-auto whitespace-pre-wrap text-[12px]">{JSON.stringify(row.changes, null, 2)}</pre>
                      </details>
                    ) : null}
                  </td>
                  <td className="text-[12.5px] text-[var(--muted)]">
                    {row.ip ?? '—'}
                    <div className="max-w-40 truncate" title={row.correlationId ?? ''}>
                      {row.correlationId}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={page} total={total} pageSize={pageSize} hrefFor={(next) => `/app/auditoria?${search({ pagina: String(next) })}`} />
    </>
  )
}
