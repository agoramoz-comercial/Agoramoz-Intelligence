import type { Role } from '@/server/auth/rbac'

export interface ApprovalStep {
  position: number
  role: Role
  label: string
  minSalaryMax: number | null
}

/**
 * Passos aplicáveis a uma requisição. Um passo com limiar aplica-se quando o tecto salarial o atinge
 * ou quando o orçamento é desconhecido (regra conservadora).
 */
export function applicableSteps(steps: readonly ApprovalStep[], salaryMax: number | null): ApprovalStep[] {
  return [...steps]
    .filter((step) => step.minSalaryMax === null || salaryMax === null || salaryMax >= step.minSalaryMax)
    .sort((a, b) => a.position - b.position)
}

export function firstStep(steps: readonly ApprovalStep[], salaryMax: number | null): ApprovalStep | null {
  return applicableSteps(steps, salaryMax)[0] ?? null
}

export function stepAfter(steps: readonly ApprovalStep[], salaryMax: number | null, position: number): ApprovalStep | null {
  return applicableSteps(steps, salaryMax).find((step) => step.position > position) ?? null
}

export type DecisionBlock = 'not_pending' | 'own_requisition' | 'wrong_role' | null

/** Quem pode decidir o passo corrente: o papel do passo ou um administrador, nunca o próprio requisitante. */
export function decisionBlock(args: {
  status: string
  requestedBy: string
  userId: string
  userRole: Role
  step: ApprovalStep | null
}): DecisionBlock {
  if (args.status !== 'pending_approval' || !args.step) return 'not_pending'
  if (args.requestedBy === args.userId) return 'own_requisition'
  if (args.userRole !== args.step.role && args.userRole !== 'org_admin') return 'wrong_role'
  return null
}
