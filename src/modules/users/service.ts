import { z } from 'zod'
import { withTenant } from '@/server/db/client'
import { recordAudit } from '@/server/audit/audit'
import { actorOf, type RequestContext } from '@/server/context'
import { AppError, forbidden, notFound } from '@/server/errors'
import { can, ROLES, type Role } from '@/server/auth/rbac'
import { hashPassword, MIN_PASSWORD_LENGTH } from '@/server/auth/password'
import { parseInput } from '@/server/validation'

export interface UserRow {
  id: string
  email: string
  fullName: string
  role: Role
  departmentId: string | null
  departmentName: string | null
  status: 'active' | 'disabled'
  lastLoginAt: Date | null
}

export interface DepartmentRow {
  id: string
  name: string
}

function requireOrgManage(ctx: RequestContext): void {
  if (!can(ctx.user.role, 'org.manage')) throw forbidden()
}

export async function listUsers(ctx: RequestContext): Promise<UserRow[]> {
  return withTenant(ctx.tenantId, (tx) => tx<UserRow[]>`
    select u.id, u.email, u.full_name, u.role, u.department_id, d.name as department_name, u.status, u.last_login_at
    from users u left join departments d on d.id = u.department_id
    order by u.status, u.full_name
  `)
}

/** Lista leve para selecção de participantes, responsáveis e aprovadores. */
export async function listActiveUsers(ctx: RequestContext): Promise<Pick<UserRow, 'id' | 'fullName' | 'role'>[]> {
  return withTenant(ctx.tenantId, (tx) => tx<Pick<UserRow, 'id' | 'fullName' | 'role'>[]>`
    select id, full_name, role from users where status = 'active' order by full_name
  `)
}

export async function listDepartments(ctx: RequestContext): Promise<DepartmentRow[]> {
  return withTenant(ctx.tenantId, (tx) => tx<DepartmentRow[]>`select id, name from departments order by name`)
}

const createUserSchema = z.object({
  email: z.string().trim().toLowerCase().email('Email inválido'),
  fullName: z.string().trim().min(2, 'Indique o nome').max(120),
  role: z.enum(ROLES),
  departmentId: z.string().uuid().optional().or(z.literal('').transform(() => undefined)),
  password: z.string().min(MIN_PASSWORD_LENGTH, `Mínimo ${MIN_PASSWORD_LENGTH} caracteres`).max(200),
})

export async function createUser(ctx: RequestContext, input: unknown): Promise<string> {
  requireOrgManage(ctx)
  const data = parseInput(createUserSchema, input)
  const passwordHash = await hashPassword(data.password)
  return withTenant(ctx.tenantId, async (tx) => {
    try {
      const [row] = await tx<{ id: string }[]>`
        insert into users (tenant_id, email, full_name, role, department_id, password_hash)
        values (${ctx.tenantId}, ${data.email}, ${data.fullName}, ${data.role}, ${data.departmentId ?? null}, ${passwordHash})
        returning id
      `
      if (!row) throw new Error('insert falhou')
      await recordAudit(tx, actorOf(ctx), {
        action: 'user.created',
        entityType: 'user',
        entityId: row.id,
        summary: `Utilizador criado com papel ${data.role}`,
        changes: { role: data.role, departmentId: data.departmentId ?? null },
      })
      return row.id
    } catch (error: unknown) {
      if (error instanceof Error && 'code' in error && error.code === '23505') {
        throw new AppError('CONFLICT', 'Já existe um utilizador com este email.', { email: 'Email já registado' })
      }
      throw error
    }
  })
}

const updateUserSchema = z.object({
  role: z.enum(ROLES),
  departmentId: z.string().uuid().optional().or(z.literal('').transform(() => undefined)),
  status: z.enum(['active', 'disabled']),
})

export async function updateUser(ctx: RequestContext, userId: string, input: unknown): Promise<void> {
  requireOrgManage(ctx)
  const data = parseInput(updateUserSchema, input)
  if (userId === ctx.user.id && (data.status === 'disabled' || data.role !== 'org_admin')) {
    throw new AppError('VALIDATION', 'Não pode retirar o seu próprio acesso de administrador.')
  }
  await withTenant(ctx.tenantId, async (tx) => {
    const [before] = await tx<{ role: string; status: string; departmentId: string | null }[]>`
      select role, status, department_id from users where id = ${userId}
    `
    if (!before) throw notFound('Utilizador')
    await tx`
      update users set role = ${data.role}, department_id = ${data.departmentId ?? null}, status = ${data.status}
      where id = ${userId}
    `
    if (data.status === 'disabled') {
      await tx`update sessions set revoked_at = now() where user_id = ${userId} and revoked_at is null`
    }
    await recordAudit(tx, actorOf(ctx), {
      action: 'user.updated',
      entityType: 'user',
      entityId: userId,
      summary: 'Papel ou estado de utilizador alterado',
      changes: { before, after: { role: data.role, status: data.status, departmentId: data.departmentId ?? null } },
    })
  })
}

export async function createDepartment(ctx: RequestContext, name: string): Promise<void> {
  requireOrgManage(ctx)
  const clean = parseInput(z.string().trim().min(2, 'Nome demasiado curto').max(80), name)
  await withTenant(ctx.tenantId, async (tx) => {
    const [row] = await tx<{ id: string }[]>`
      insert into departments (tenant_id, name) values (${ctx.tenantId}, ${clean})
      on conflict (tenant_id, name) do nothing returning id
    `
    if (!row) throw new AppError('CONFLICT', 'Este departamento já existe.')
    await recordAudit(tx, actorOf(ctx), { action: 'department.created', entityType: 'department', entityId: row.id, summary: `Departamento "${clean}" criado` })
  })
}

export async function resetUserPassword(ctx: RequestContext, userId: string, password: string): Promise<void> {
  requireOrgManage(ctx)
  const clean = parseInput(z.string().min(MIN_PASSWORD_LENGTH, `Mínimo ${MIN_PASSWORD_LENGTH} caracteres`).max(200), password)
  const passwordHash = await hashPassword(clean)
  await withTenant(ctx.tenantId, async (tx) => {
    const updated = await tx`update users set password_hash = ${passwordHash}, failed_logins = 0, locked_until = null where id = ${userId} returning id`
    if (updated.length === 0) throw notFound('Utilizador')
    await tx`update sessions set revoked_at = now() where user_id = ${userId} and revoked_at is null`
    await recordAudit(tx, actorOf(ctx), { action: 'user.password_reset', entityType: 'user', entityId: userId, summary: 'Palavra-passe redefinida pelo administrador; sessões terminadas' })
  })
}

export interface ApprovalStepRow {
  position: number
  role: Role
  label: string
  minSalaryMax: string | null
}

export async function listApprovalSteps(ctx: RequestContext): Promise<ApprovalStepRow[]> {
  return withTenant(ctx.tenantId, (tx) => tx<ApprovalStepRow[]>`select position, role, label, min_salary_max from approval_steps order by position`)
}
