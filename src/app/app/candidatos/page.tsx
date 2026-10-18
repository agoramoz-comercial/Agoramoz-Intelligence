import type { Metadata } from 'next'
import Link from 'next/link'
import { requirePermission } from '@/server/auth/current'
import { can } from '@/server/auth/rbac'
import { searchCandidates } from '@/modules/candidates/service'
import { listVacancies } from '@/modules/vacancies/service'
import { SOURCE_LABELS, APPLICATION_SOURCES, type ApplicationSource } from '@/modules/applications/intake'
import { Badge, EmptyState, PageHeader, Pagination } from '@/components/ui'
import { formatDate } from '@/lib/format'

export const metadata: Metadata = { title: 'Candidatos' }

const STATUS_LABELS: Record<string, string> = { active: 'Em processo', hired: 'Contratado', rejected: 'Não seleccionado', withdrawn: 'Retirada' }

export default async function CandidatesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requirePermission('candidate.view')
  const params = await searchParams
  const page = Number(params.pagina ?? 1) || 1
  const filters = {
    q: params.q?.slice(0, 100),
    vacancyId: params.vaga || undefined,
    source: APPLICATION_SOURCES.includes(params.origem as ApplicationSource) ? params.origem : undefined,
    status: params.estado && STATUS_LABELS[params.estado] ? params.estado : undefined,
    talentPool: params.pool === '1',
    page,
  }
  const [{ rows, total, pageSize }, vacancies] = await Promise.all([searchCandidates(ctx, filters), can(ctx.user.role, 'vacancy.view') ? listVacancies(ctx) : Promise.resolve([])])
  const query = (next: number) => {
    const search = new URLSearchParams(Object.entries({ ...params, pagina: String(next) }).filter(([, value]) => value) as [string, string][])
    return `/app/candidatos?${search.toString()}`
  }
  return (
    <>
      <PageHeader
        title="Candidatos"
        description={`${total} registo(s). Pesquisa por nome, email, telefone ou localidade, sem acentos.`}
        actions={
          can(ctx.user.role, 'candidate.manage') ? (
            <>
              <Link className="btn btn-quiet" href="/app/candidatos/importar">
                Importar folha
              </Link>
              <Link className="btn" href="/app/candidatos/novo">
                Registar candidatura
              </Link>
            </>
          ) : null
        }
      />
      <form method="get" className="panel mb-4 grid grid-cols-1 gap-3 p-4 md:grid-cols-[2fr_1fr_1fr_1fr_auto]">
        <label className="text-[12.5px] font-semibold">
          Pesquisar
          <input name="q" defaultValue={params.q} className="input mt-1" placeholder="Nome, email, telefone…" />
        </label>
        <label className="text-[12.5px] font-semibold">
          Vaga
          <select name="vaga" defaultValue={params.vaga ?? ''} className="select mt-1">
            <option value="">Todas</option>
            {vacancies.map((vacancy) => (
              <option key={vacancy.id} value={vacancy.id}>
                {vacancy.title}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[12.5px] font-semibold">
          Origem
          <select name="origem" defaultValue={params.origem ?? ''} className="select mt-1">
            <option value="">Todas</option>
            {APPLICATION_SOURCES.map((source) => (
              <option key={source} value={source}>
                {SOURCE_LABELS[source]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[12.5px] font-semibold">
          Estado
          <select name="estado" defaultValue={params.estado ?? ''} className="select mt-1">
            <option value="">Todos</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end gap-3">
          <label className="check pb-2.5 text-[13px]">
            <input type="checkbox" name="pool" value="1" defaultChecked={params.pool === '1'} />
            <span>Talent pool</span>
          </label>
          <button className="btn" type="submit">
            Filtrar
          </button>
        </div>
      </form>
      {rows.length === 0 ? (
        <EmptyState title="Nenhum candidato encontrado">Ajuste a pesquisa ou os filtros.</EmptyState>
      ) : (
        <div className="panel overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Contacto</th>
                <th>Última candidatura</th>
                <th>Origem</th>
                <th>Registado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <Link className="link font-medium" href={`/app/candidatos/${row.id}`}>
                      {row.fullName}
                    </Link>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {row.hasDuplicate ? <Badge tone="info">Possível duplicado</Badge> : null}
                      {row.consentTalentPool ? <Badge>Talent pool</Badge> : null}
                      {row.anonymized ? <Badge>Anonimizado</Badge> : null}
                    </div>
                  </td>
                  <td className="text-[13.5px]">
                    {row.email ?? '—'}
                    <div className="text-[var(--muted)]">{row.phone ?? ''}</div>
                  </td>
                  <td className="text-[13.5px]">
                    {row.lastVacancy ?? '—'}
                    {row.lastStatus ? (
                      <div className="text-[var(--muted)]">
                        {STATUS_LABELS[row.lastStatus]}
                        {row.lastStage ? ` · ${row.lastStage}` : ''}
                      </div>
                    ) : null}
                  </td>
                  <td className="text-[13.5px]">{SOURCE_LABELS[row.source as ApplicationSource] ?? row.source}</td>
                  <td className="nums whitespace-nowrap text-[13.5px]">{formatDate(row.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={page} total={total} pageSize={pageSize} hrefFor={query} />
    </>
  )
}
