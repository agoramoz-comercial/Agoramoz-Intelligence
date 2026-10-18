import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireUser } from '@/server/auth/current'
import { can } from '@/server/auth/rbac'
import { getDashboard, type Kpi } from '@/modules/analytics/service'
import { pendingApprovalsFor } from '@/modules/requisitions/service'
import { SOURCE_LABELS, type ApplicationSource } from '@/modules/applications/intake'
import { PageHeader, Section, EmptyState, Badge } from '@/components/ui'
import { Funnel, GroupedColumns, HorizontalBars, StatTile } from '@/components/charts'
import { formatDate, formatNumber, formatPercent } from '@/lib/format'

export const metadata: Metadata = { title: 'Painel' }

function kpiValue(kpi: Kpi): string {
  if (kpi.value === null) return '—'
  if (kpi.unit === 'ratio') return formatPercent(kpi.value)
  if (kpi.unit === 'days') return `${formatNumber(kpi.value)} dias`
  return formatNumber(kpi.value)
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ de?: string; ate?: string }> }) {
  const ctx = await requireUser()
  if (!can(ctx.user.role, 'dashboard.view')) redirect('/app/entrevistas')
  const params = await searchParams
  const data = await getDashboard(ctx, { from: params.de, to: params.ate })
  const approvals = await pendingApprovalsFor(ctx)
  const query = `de=${data.period.from}&ate=${data.period.to}`
  return (
    <div className="space-y-6">
      <PageHeader
        title={`Bom dia, ${ctx.user.fullName.split(' ')[0]}`}
        description={`Recrutamento de ${formatDate(data.period.from)} a ${formatDate(data.period.to)}. Cada número tem a sua definição; nada aqui é estimado.`}
        actions={
          <form className="flex flex-wrap items-end gap-2" method="get">
            <label className="text-[12.5px] font-semibold">
              De
              <input type="date" name="de" defaultValue={data.period.from} className="input mt-1 w-auto" />
            </label>
            <label className="text-[12.5px] font-semibold">
              Até
              <input type="date" name="ate" defaultValue={data.period.to} className="input mt-1 w-auto" />
            </label>
            <button className="btn btn-quiet" type="submit">
              Aplicar
            </button>
            <a className="btn btn-quiet" href={`/api/export/painel?${query}`}>
              Exportar CSV
            </a>
          </form>
        }
      />

      {approvals.length > 0 ? (
        <Section title="À espera da sua decisão">
          <ul className="divide-y divide-[var(--grid)]">
            {approvals.map((requisition) => (
              <li key={requisition.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <strong>{requisition.code}</strong> · {requisition.title} · {requisition.location}
                </span>
                <Link className="btn btn-sm" href={`/app/requisicoes/${requisition.id}`}>
                  Rever e decidir
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
        {data.kpis.map((kpi, index) => (
          <div key={kpi.key} style={{ ['--i' as string]: index }} className="contents">
            <StatTile label={kpi.label} value={kpiValue(kpi)} definition={kpi.definition} target={kpi.target} onTarget={kpi.onTarget} />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Section title="Funil do período">
          {data.funnel[0]?.reached ? <Funnel steps={data.funnel} /> : <EmptyState title="Sem candidaturas no período">Alargue o período ou publique uma vaga.</EmptyState>}
        </Section>
        <Section title="Candidaturas e contratações por semana">
          <GroupedColumns
            title="Candidaturas e contratações por semana"
            series={['Candidaturas', 'Contratações']}
            points={data.weekly.map((week) => ({ label: formatDate(week.week).replace(/ de \d{4}$/, ''), values: [week.applications, week.hires] }))}
          />
        </Section>
        <Section title="Origem das candidaturas">
          {data.sources.length ? (
            <HorizontalBars
              title="Candidaturas por origem"
              valueLabel="candidaturas"
              rows={data.sources.map((source) => ({
                label: SOURCE_LABELS[source.source as ApplicationSource] ?? source.source,
                value: source.applications,
                note: `${source.hired} contratada(s)`,
              }))}
            />
          ) : (
            <EmptyState title="Sem dados de origem" />
          )}
        </Section>
        <Section title="Vagas activas">
          {data.vacancies.length ? (
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Vaga</th>
                    <th className="text-right">Candidaturas</th>
                    <th className="text-right">Em entrevista</th>
                    <th className="text-right">Ofertas</th>
                    <th className="text-right">Contratados</th>
                    <th className="text-right">Dias aberta</th>
                  </tr>
                </thead>
                <tbody>
                  {data.vacancies.map((vacancy) => (
                    <tr key={vacancy.id}>
                      <td>
                        <Link className="link" href={`/app/vagas/${vacancy.id}`}>
                          {vacancy.title}
                        </Link>
                      </td>
                      <td className="nums text-right">{vacancy.applications}</td>
                      <td className="nums text-right">{vacancy.interviewing}</td>
                      <td className="nums text-right">{vacancy.offers}</td>
                      <td className="nums text-right">{vacancy.hired}</td>
                      <td className="nums text-right">{vacancy.daysOpen}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="Nenhuma vaga publicada" />
          )}
        </Section>
      </div>

      {data.includesLists ? (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <Section title="Bloqueios: candidaturas paradas">
            {data.stalled.length ? (
              <ul className="divide-y divide-[var(--grid)]">
                {data.stalled.map((item) => (
                  <li key={item.applicationId} className="flex items-center justify-between gap-3 py-2 text-[14px]">
                    <span>
                      <Link className="link font-medium" href={`/app/candidaturas/${item.applicationId}`}>
                        {item.candidateName}
                      </Link>{' '}
                      <span className="text-[var(--muted)]">
                        · {item.vacancyTitle} · {item.stageName}
                      </span>
                    </span>
                    <Badge tone="warn">{item.days} dias</Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="Nenhuma candidatura parada">Todas as candidaturas activas tiveram movimento recente.</EmptyState>
            )}
          </Section>
          <Section title="Scorecards por submeter">
            {data.pendingScorecards.length ? (
              <ul className="divide-y divide-[var(--grid)]">
                {data.pendingScorecards.map((item) => (
                  <li key={`${item.interviewId}-${item.interviewerName}`} className="flex items-center justify-between gap-3 py-2 text-[14px]">
                    <span>
                      <strong>{item.interviewerName}</strong> <span className="text-[var(--muted)]">sobre</span>{' '}
                      <Link className="link" href={`/app/candidaturas/${item.applicationId}`}>
                        {item.candidateName}
                      </Link>
                    </span>
                    <Badge tone={item.daysSince > 2 ? 'danger' : 'warn'}>há {item.daysSince} dia(s)</Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="Sem scorecards em atraso" />
            )}
          </Section>
        </div>
      ) : null}

      <p className="text-[12.5px] text-[var(--muted)]">
        Mensagens no período: {data.messageHealth.sent} entregues, {data.messageHealth.failed} com falha temporária, {data.messageHealth.dead} esgotadas, {data.messageHealth.queued} em fila.
        {data.pendingApprovals.count > 0 ? ` Requisições em aprovação: ${data.pendingApprovals.count} (mais antiga há ${data.pendingApprovals.oldestDays ?? 0} dias).` : ''}
      </p>
    </div>
  )
}
