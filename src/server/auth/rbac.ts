export const ROLES = ['org_admin', 'hr', 'hiring_manager', 'interviewer', 'executive', 'privacy_officer'] as const
export type Role = (typeof ROLES)[number]

export const ROLE_LABELS: Record<Role, string> = {
  org_admin: 'Administrador',
  hr: 'Recursos Humanos',
  hiring_manager: 'Gestor requisitante',
  interviewer: 'Entrevistador',
  executive: 'Direcção',
  privacy_officer: 'Encarregado de privacidade',
}

export type Permission =
  | 'org.manage'
  | 'requisition.create'
  | 'requisition.view'
  | 'requisition.approve'
  | 'vacancy.manage'
  | 'vacancy.view'
  | 'candidate.view'
  | 'candidate.manage'
  | 'application.view'
  | 'application.move'
  | 'application.decide'
  | 'comment.create'
  | 'interview.schedule'
  | 'interview.view_assigned'
  | 'scorecard.submit'
  | 'scorecard.view_all'
  | 'message.send'
  | 'message.view'
  | 'template.manage'
  | 'dashboard.view'
  | 'audit.view'
  | 'audit.export'
  | 'privacy.manage'
  | 'data.export'
  | 'ai.use'

const HR_PERMISSIONS: readonly Permission[] = [
  'requisition.create', 'requisition.view', 'requisition.approve', 'vacancy.manage', 'vacancy.view',
  'candidate.view', 'candidate.manage', 'application.view', 'application.move', 'application.decide',
  'comment.create', 'interview.schedule', 'interview.view_assigned', 'scorecard.submit', 'scorecard.view_all',
  'message.send', 'message.view', 'template.manage', 'dashboard.view', 'audit.view', 'ai.use',
]

const MATRIX: Record<Role, readonly Permission[]> = {
  org_admin: [...HR_PERMISSIONS, 'org.manage', 'audit.export', 'privacy.manage', 'data.export'],
  hr: HR_PERMISSIONS,
  hiring_manager: [
    'requisition.create', 'requisition.view', 'requisition.approve', 'vacancy.view', 'application.view',
    'comment.create', 'interview.view_assigned', 'scorecard.submit', 'scorecard.view_all', 'dashboard.view',
  ],
  interviewer: ['interview.view_assigned', 'scorecard.submit'],
  executive: ['requisition.view', 'requisition.approve', 'vacancy.view', 'dashboard.view'],
  privacy_officer: ['candidate.view', 'privacy.manage', 'audit.view', 'audit.export', 'data.export', 'dashboard.view'],
}

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value)
}

export function can(role: Role, permission: Permission): boolean {
  return MATRIX[role].includes(permission)
}

export function permissionsFor(role: Role): readonly Permission[] {
  return MATRIX[role]
}

/** Gestores e entrevistadores só vêem candidaturas ligadas a si (need-to-know, Blueprint §8.2). */
export function hasScopedApplicationAccess(role: Role): boolean {
  return role === 'hiring_manager' || role === 'interviewer'
}
