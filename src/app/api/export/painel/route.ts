import type { NextRequest } from 'next/server'
import { authorize } from '@/server/auth/current'
import { download } from '@/server/http/download'
import { toCsv } from '@/lib/csv'
import { getDashboard } from '@/modules/analytics/service'

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  return download(async () => {
    const data = await getDashboard(await authorize('dashboard.view'), { from: params.get('de') ?? undefined, to: params.get('ate') ?? undefined })
    const rows: unknown[][] = [
      ...data.kpis.map((kpi) => ['kpi', kpi.label, kpi.value, kpi.unit, kpi.target, kpi.definition]),
      ...data.funnel.map((step) => ['funil', step.label, step.reached, 'count', null, 'Candidaturas que chegaram pelo menos a esta etapa']),
      ...data.sources.map((source) => ['origem', source.source, source.applications, 'count', null, `${source.hired} contratada(s)`]),
      ...data.weekly.map((week) => ['semana', week.week, week.applications, 'count', null, `${week.hires} contratação(ões)`]),
    ]
    return {
      body: toCsv(['tipo', 'indicador', 'valor', 'unidade', 'meta', 'definicao'], [['periodo', `${data.period.from} a ${data.period.to}`, null, null, null, null], ...rows]),
      filename: `painel-${data.period.from}-${data.period.to}.csv`,
      contentType: 'text/csv; charset=utf-8',
    }
  })
}
