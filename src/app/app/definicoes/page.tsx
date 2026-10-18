import type { Metadata } from 'next'
import { requirePermission } from '@/server/auth/current'
import { ROLE_LABELS, ROLES } from '@/server/auth/rbac'
import { listApprovalSteps, listDepartments, listUsers } from '@/modules/users/service'
import { getSettings } from '@/modules/organizations/service'
import { ActionForm, Field, SubmitButton } from '@/components/form'
import { Badge, PageHeader, Section } from '@/components/ui'
import { formatDateTime, formatMzn } from '@/lib/format'
import { createUserAction, departmentAction, resetPasswordAction, settingsAction, updateUserAction } from './actions'

export const metadata: Metadata = { title: 'Definições' }

export default async function SettingsPage() {
  const ctx = await requirePermission('org.manage')
  const [users, departments, steps, settings] = await Promise.all([listUsers(ctx), listDepartments(ctx), listApprovalSteps(ctx), getSettings(ctx)])
  return (
    <div className="space-y-6">
      <PageHeader title="Definições da organização" description={`${settings.name} · página pública /carreiras/${settings.slug}`} />

      <Section title="Utilizadores e papéis">
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Utilizador</th>
                <th>Papel, departamento e estado</th>
                <th>Último acesso</th>
                <th>Palavra-passe</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>
                    <strong>{user.fullName}</strong>
                    <div className="text-[13px] text-[var(--muted)]">{user.email}</div>
                    {user.status === 'disabled' ? <Badge tone="danger">Desactivado</Badge> : null}
                  </td>
                  <td>
                    <ActionForm action={updateUserAction.bind(null, user.id)} className="flex flex-wrap items-end gap-2">
                      <select name="role" aria-label="Papel" className="select w-auto" defaultValue={user.role}>
                        {ROLES.map((role) => (
                          <option key={role} value={role}>
                            {ROLE_LABELS[role]}
                          </option>
                        ))}
                      </select>
                      <select name="departmentId" aria-label="Departamento" className="select w-auto" defaultValue={user.departmentId ?? ''}>
                        <option value="">Sem departamento</option>
                        {departments.map((department) => (
                          <option key={department.id} value={department.id}>
                            {department.name}
                          </option>
                        ))}
                      </select>
                      <select name="status" aria-label="Estado" className="select w-auto" defaultValue={user.status}>
                        <option value="active">Activo</option>
                        <option value="disabled">Desactivado</option>
                      </select>
                      <SubmitButton className="btn btn-quiet btn-sm">Guardar</SubmitButton>
                    </ActionForm>
                  </td>
                  <td className="nums whitespace-nowrap text-[13px]">{formatDateTime(user.lastLoginAt)}</td>
                  <td>
                    <details>
                      <summary className="cursor-pointer text-[13px] font-semibold">Redefinir</summary>
                      <ActionForm action={resetPasswordAction.bind(null, user.id)} className="mt-2 flex flex-wrap items-end gap-2">
                        <input name="password" type="password" aria-label="Nova palavra-passe" autoComplete="new-password" className="input w-48" placeholder="Mín. 12 caracteres" />
                        <SubmitButton className="btn btn-quiet btn-sm">Definir</SubmitButton>
                      </ActionForm>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <details className="mt-5 rounded-lg bg-[var(--surface)] p-4">
          <summary className="cursor-pointer font-semibold">Adicionar utilizador</summary>
          <ActionForm action={createUserAction} resetOnSuccess className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field name="fullName" label="Nome">
              <input id="fullName" name="fullName" className="input" />
            </Field>
            <Field name="email" label="Email">
              <input id="email" name="email" type="email" className="input" />
            </Field>
            <Field name="role" label="Papel">
              <select id="role" name="role" className="select" defaultValue="interviewer">
                {ROLES.map((role) => (
                  <option key={role} value={role}>
                    {ROLE_LABELS[role]}
                  </option>
                ))}
              </select>
            </Field>
            <Field name="departmentId" label="Departamento">
              <select id="departmentId" name="departmentId" className="select">
                <option value="">Sem departamento</option>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field name="password" label="Palavra-passe inicial" hint="Mínimo 12 caracteres. Peça à pessoa para a mudar no primeiro acesso.">
              <input id="password" name="password" type="password" autoComplete="new-password" className="input" />
            </Field>
            <div className="flex items-end">
              <SubmitButton>Criar utilizador</SubmitButton>
            </div>
          </ActionForm>
        </details>
      </Section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Section title="Regras do processo">
          <ActionForm action={settingsAction} className="space-y-4">
            <label className="check">
              <input type="checkbox" name="hideFeedbackUntilSubmitted" defaultChecked={settings.hideFeedbackUntilSubmitted} />
              <span>Ocultar o feedback dos outros entrevistadores até cada um submeter o seu</span>
            </label>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field name="retentionMonths" label="Retenção após decisão (meses)">
                <input id="retentionMonths" name="retentionMonths" type="number" min={1} max={60} className="input" defaultValue={settings.retentionMonths} />
              </Field>
              <Field name="talentPoolMonths" label="Talent pool (meses)">
                <input id="talentPoolMonths" name="talentPoolMonths" type="number" min={1} max={60} className="input" defaultValue={settings.talentPoolMonths} />
              </Field>
              <Field name="stalledDays" label="Alerta de bloqueio (dias)">
                <input id="stalledDays" name="stalledDays" type="number" min={1} max={60} className="input" defaultValue={settings.stalledDays} />
              </Field>
            </div>
            <Field name="privacyContactEmail" label="Contacto de privacidade (público)">
              <input id="privacyContactEmail" name="privacyContactEmail" type="email" className="input" defaultValue={settings.privacyContactEmail ?? ''} />
            </Field>
            <SubmitButton>Guardar regras</SubmitButton>
          </ActionForm>
        </Section>
        <div className="space-y-6">
          <Section title="Matriz de aprovação">
            <ol className="space-y-2 text-[14px]">
              {steps.map((step) => (
                <li key={step.position} className="rounded-lg bg-[var(--surface)] p-3">
                  <strong>
                    {step.position}. {step.label}
                  </strong>
                  <span className="block text-[var(--muted)]">
                    {ROLE_LABELS[step.role]}
                    {step.minSalaryMax ? ` · só quando o tecto salarial ≥ ${formatMzn(step.minSalaryMax)}` : ' · sempre'}
                  </span>
                </li>
              ))}
            </ol>
            <p className="mt-3 text-[13px] text-[var(--muted)]">Ajustes à matriz são feitos com a equipa AGORAMOZ na implementação assistida (ficam auditados).</p>
          </Section>
          <Section title="Departamentos">
            <p className="mb-3 text-[14px]">{departments.map((department) => department.name).join(' · ')}</p>
            <ActionForm action={departmentAction} resetOnSuccess className="flex flex-wrap items-end gap-2">
              <Field name="name" label="Novo departamento">
                <input id="name" name="name" className="input" />
              </Field>
              <SubmitButton className="btn btn-quiet">Adicionar</SubmitButton>
            </ActionForm>
          </Section>
        </div>
      </div>
    </div>
  )
}
