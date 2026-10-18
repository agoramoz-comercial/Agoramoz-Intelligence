import { withTenant } from '@/server/db/client'
import type { RequestContext } from '@/server/context'
import { forbidden } from '@/server/errors'
import { can } from '@/server/auth/rbac'
import { applicationScope } from '@/modules/applications/scope'
import { loadSettings } from '@/modules/organizations/settings'

export interface Kpi {
  key: string
  label: string
  value: number | null
  unit: 'count' | 'days' | 'ratio'
  definition: string
  target: string | null
  /** Verdadeiro/falso face à meta do piloto; null sem meta ou sem dados. */
  onTarget: boolean | null
}

export interface DashboardData {
  period: { from: string; to: string }
  kpis: Kpi[]
  funnel: { kind: string; label: string; reached: number }[]
  sources: { source: string; applications: number; hired: number }[]
  vacancies: { id: string; title: string; applications: number; interviewing: number; offers: number; hired: number; daysOpen: number }[]
  stalled: { applicationId: string; candidateName: string; vacancyTitle: string; stageName: string; days: number }[]
  pendingScorecards: { interviewId: string; applicationId: string; candidateName: string; interviewerName: string; daysSince: number }[]
  pendingApprovals: { count: number; oldestDays: number | null }
  messageHealth: { sent: number; failed: number; dead: number; queued: number }
  weekly: { week: string; applications: number; hires: number }[]
  includesLists: boolean
}

const FUNNEL = [
  { kind: 'new', label: 'Recebidas', position: 1 },
  { kind: 'screening', label: 'Triagem', position: 2 },
  { kind: 'interview', label: 'Entrevista', position: 3 },
  { kind: 'assessment', label: 'Avaliação final', position: 4 },
  { kind: 'offer', label: 'Oferta', position: 5 },
  { kind: 'hired', label: 'Contratado', position: 6 },
] as const

function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null
}

function onTarget(value: number | null, check: (value: number) => boolean): boolean | null {
  return value === null ? null : check(value)
}

export function normalizePeriod(from?: string, to?: string): { from: string; to: string } {
  const valid = (value?: string) => (value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined)
  const end = valid(to) ?? new Date().toISOString().slice(0, 10)
  const start = valid(from) ?? new Date(Date.parse(`${end}T00:00:00Z`) - 89 * 86_400_000).toISOString().slice(0, 10)
  return start <= end ? { from: start, to: end } : { from: end, to: start }
}

export async function getDashboard(ctx: RequestContext, period: { from?: string; to?: string }): Promise<DashboardData> {
  if (!can(ctx.user.role, 'dashboard.view')) throw forbidden()
  const { from, to } = normalizePeriod(period.from, period.to)
  const includesLists = can(ctx.user.role, 'application.view')
  return withTenant(ctx.tenantId, async (tx) => {
    const settings = await loadSettings(tx, ctx.tenantId)
    const range = tx`>= ${from}::date and a.created_at < (${to}::date + 1)`
    const [base] = await tx<{
      activeVacancies: number
      applications: number
      withEmail: number
      confirmed: number
      hires: number
      medianDays: number | null
      closed: number
      closedAnswered: number
      finalists: number
      finalistsComplete: number
    }[]>`
      select
        (select count(*)::int from vacancies where status = 'published') as active_vacancies,
        (select count(*)::int from applications a where a.created_at ${range}) as applications,
        (select count(*)::int from applications a join candidates c on c.id = a.candidate_id where a.created_at ${range} and c.email is not null) as with_email,
        (select count(*)::int from applications a where a.created_at ${range}
          and exists (select 1 from messages m where m.application_id = a.id and m.template_key = 'application_received' and m.status = 'sent')) as confirmed,
        (select count(*)::int from applications a where a.status = 'hired' and a.decided_at >= ${from}::date and a.decided_at < (${to}::date + 1)) as hires,
        (select percentile_cont(0.5) within group (order by extract(epoch from a.decided_at - a.created_at) / 86400)
          from applications a where a.status = 'hired' and a.decided_at >= ${from}::date and a.decided_at < (${to}::date + 1)) as median_days,
        (select count(*)::int from applications a where a.status in ('hired', 'rejected') and a.decided_at >= ${from}::date and a.decided_at < (${to}::date + 1)) as closed,
        (select count(*)::int from applications a where a.status in ('hired', 'rejected') and a.decided_at >= ${from}::date and a.decided_at < (${to}::date + 1)
          and exists (select 1 from messages m where m.application_id = a.id and m.template_key in ('rejection', 'hired') and m.status in ('queued', 'sending', 'sent'))) as closed_answered,
        (select count(*)::int from applications a join pipeline_stages s on s.id = a.stage_id
          where a.created_at ${range} and s.kind in ('assessment', 'offer', 'hired')) as finalists,
        (select count(*)::int from applications a join pipeline_stages s on s.id = a.stage_id
          where a.created_at ${range} and s.kind in ('assessment', 'offer', 'hired')
            and exists (select 1 from scorecards sc where sc.application_id = a.id and sc.status = 'submitted')
            and not exists (
              select 1 from interviews i join interview_participants p on p.interview_id = i.id
              where i.application_id = a.id and i.status <> 'cancelled' and i.starts_at < now()
                and not exists (select 1 from scorecards sc2 where sc2.interview_id = i.id and sc2.author_id = p.user_id and sc2.status = 'submitted')
            )) as finalists_complete
    `
    const [adoption] = await tx<{ active: number; total: number }[]>`
      select count(*) filter (where last_login_at > now() - interval '7 days')::int as active, count(*)::int as total
      from users where status = 'active' and role in ('hr', 'org_admin')
    `
    const [messages] = await tx<DashboardData['messageHealth'][]>`
      select count(*) filter (where status = 'sent')::int as sent, count(*) filter (where status = 'failed')::int as failed,
        count(*) filter (where status = 'dead')::int as dead, count(*) filter (where status in ('queued', 'sending'))::int as queued
      from messages where created_at >= ${from}::date and created_at < (${to}::date + 1)
    `
    const funnelRows = await tx<{ position: number; count: number }[]>`
      select s.position, count(*)::int as count
      from applications a join pipeline_stages s on s.id = a.stage_id
      where a.created_at ${range} and a.status <> 'withdrawn'
      group by s.position
    `
    const funnel = FUNNEL.map((step) => ({
      kind: step.kind,
      label: step.label,
      reached: funnelRows.filter((row) => row.position >= step.position).reduce((sum, row) => sum + row.count, 0),
    }))
    const sources = await tx<DashboardData['sources']>`
      select a.source, count(*)::int as applications, count(*) filter (where a.status = 'hired')::int as hired
      from applications a where a.created_at ${range} group by a.source order by applications desc
    `
    const vacancies = await tx<DashboardData['vacancies']>`
      select v.id, vv.title,
        count(a.id)::int as applications,
        count(a.id) filter (where s.kind = 'interview' and a.status = 'active')::int as interviewing,
        count(a.id) filter (where s.kind = 'offer' and a.status = 'active')::int as offers,
        count(a.id) filter (where a.status = 'hired')::int as hired,
        (current_date - v.published_at::date)::int as days_open
      from vacancies v join vacancy_versions vv on vv.id = v.published_version_id
      left join applications a on a.vacancy_id = v.id and a.status <> 'withdrawn'
      left join pipeline_stages s on s.id = a.stage_id
      where v.status = 'published'
      group by v.id, vv.title, v.published_at
      order by applications desc
    `
    const [approvals] = await tx<DashboardData['pendingApprovals'][]>`
      select count(*)::int as count, max(current_date - submitted_at::date)::int as oldest_days
      from requisitions where status = 'pending_approval'
    `
    const weekly = await tx<DashboardData['weekly']>`
      select to_char(w.week, 'YYYY-MM-DD') as week,
        (select count(*)::int from applications a where date_trunc('week', a.created_at) = w.week) as applications,
        (select count(*)::int from applications a where a.status = 'hired' and date_trunc('week', a.decided_at) = w.week) as hires
      from generate_series(date_trunc('week', ${from}::date), date_trunc('week', ${to}::date), interval '1 week') as w(week)
      order by w.week
    `
    const stalled = includesLists
      ? await tx<DashboardData['stalled']>`
          select a.id as application_id, c.full_name as candidate_name, coalesce(vv.title, 'Espontânea') as vacancy_title,
            s.name as stage_name, (current_date - a.stage_entered_at::date)::int as days
          from applications a join candidates c on c.id = a.candidate_id join pipeline_stages s on s.id = a.stage_id
          left join vacancy_versions vv on vv.id = a.vacancy_version_id
          where a.status = 'active' and a.stage_entered_at < now() - make_interval(days => ${settings.stalledDays}) ${applicationScope(tx, ctx)}
          order by a.stage_entered_at limit 10
        `
      : []
    const pendingScorecards = includesLists
      ? await tx<DashboardData['pendingScorecards']>`
          select i.id as interview_id, a.id as application_id, c.full_name as candidate_name, u.full_name as interviewer_name,
            (current_date - i.starts_at::date)::int as days_since
          from interviews i join interview_participants p on p.interview_id = i.id join users u on u.id = p.user_id
          join applications a on a.id = i.application_id join candidates c on c.id = a.candidate_id
          where i.status <> 'cancelled' and i.starts_at < now() and a.status = 'active'
            and not exists (select 1 from scorecards s where s.interview_id = i.id and s.author_id = p.user_id and s.status = 'submitted')
            ${applicationScope(tx, ctx)}
          order by i.starts_at limit 10
        `
      : []

    const b = base!
    const confirmation = ratio(b.confirmed, b.withEmail)
    const response = ratio(b.closedAnswered, b.closed)
    const scorecardCompletion = ratio(b.finalistsComplete, b.finalists)
    const weeklyActive = ratio(adoption?.active ?? 0, adoption?.total ?? 0)
    const delivered = messages ?? { sent: 0, failed: 0, dead: 0, queued: 0 }
    const integrationSuccess = ratio(delivered.sent, delivered.sent + delivered.failed + delivered.dead)
    const kpis: Kpi[] = [
      { key: 'active_vacancies', label: 'Vagas activas', value: b.activeVacancies, unit: 'count', definition: 'Vagas publicadas e abertas a candidaturas neste momento.', target: null, onTarget: null },
      { key: 'applications', label: 'Candidaturas recebidas', value: b.applications, unit: 'count', definition: 'Candidaturas registadas no período, por qualquer canal (página, email, WhatsApp, importação).', target: null, onTarget: null },
      { key: 'hires', label: 'Contratações', value: b.hires, unit: 'count', definition: 'Candidaturas com decisão "contratado" registada no período.', target: null, onTarget: null },
      { key: 'time_to_hire', label: 'Tempo até contratação (mediana)', value: b.medianDays === null ? null : Math.round(b.medianDays), unit: 'days', definition: 'Mediana de dias entre a candidatura e a decisão de contratação, para contratações do período.', target: 'Baseline −15%', onTarget: null },
      { key: 'confirmation_rate', label: 'Confirmação automática ao candidato', value: confirmation, unit: 'ratio', definition: 'Candidaturas com email cuja confirmação foi efectivamente entregue ao fornecedor de email.', target: '≥ 90%', onTarget: onTarget(confirmation, (v) => v >= 0.9) },
      { key: 'response_rate', label: 'Candidatos com resposta final', value: response, unit: 'ratio', definition: 'Decisões finais (contratado/rejeitado) do período com comunicação final enviada ou em envio.', target: '≥ 90%', onTarget: onTarget(response, (v) => v >= 0.9) },
      { key: 'scorecard_completion', label: 'Finalistas com scorecard completo', value: scorecardCompletion, unit: 'ratio', definition: 'Candidaturas em avaliação final, oferta ou contratadas em que todos os entrevistadores submeteram scorecard.', target: '100%', onTarget: onTarget(scorecardCompletion, (v) => v >= 1) },
      { key: 'weekly_active_hr', label: 'Utilizadores RH activos (7 dias)', value: weeklyActive, unit: 'ratio', definition: 'Utilizadores RH/Admin activos que entraram nos últimos 7 dias, sobre o total activo.', target: '≥ 60%', onTarget: onTarget(weeklyActive, (v) => v >= 0.6) },
      { key: 'integration_success', label: 'Envio de mensagens sem erro', value: integrationSuccess, unit: 'ratio', definition: 'Mensagens entregues sobre mensagens tentadas no período (exclui as ainda em fila).', target: '≥ 98%', onTarget: onTarget(integrationSuccess, (v) => v >= 0.98) },
    ]
    return {
      period: { from, to },
      kpis,
      funnel,
      sources,
      vacancies,
      stalled,
      pendingScorecards,
      pendingApprovals: approvals ?? { count: 0, oldestDays: null },
      messageHealth: delivered,
      weekly,
      includesLists,
    }
  })
}
