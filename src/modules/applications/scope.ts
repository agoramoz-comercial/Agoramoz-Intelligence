import type { Tx } from '@/server/db/client'
import type { RequestContext } from '@/server/context'

/**
 * Filtro need-to-know para consultas sobre candidaturas (alias `a`).
 * RH/Admin vêem tudo do tenant; gestores, as vagas das suas requisições/departamento;
 * entrevistadores, apenas candidaturas em que participam numa entrevista.
 */
export function applicationScope(tx: Tx, ctx: RequestContext) {
  switch (ctx.user.role) {
    case 'hiring_manager':
      return tx`and exists (
        select 1 from vacancies sv join requisitions sr on sr.id = sv.requisition_id
        where sv.id = a.vacancy_id and (sr.requested_by = ${ctx.user.id} or sr.department_id = ${ctx.user.departmentId ?? null})
      )`
    case 'interviewer':
      return tx`and exists (
        select 1 from interviews si join interview_participants sp on sp.interview_id = si.id
        where si.application_id = a.id and sp.user_id = ${ctx.user.id}
      )`
    case 'executive':
      return tx`and false`
    default:
      return tx``
  }
}
