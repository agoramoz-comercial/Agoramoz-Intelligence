'use client'

import { ActionForm, Field, SubmitButton } from '@/components/form'
import type { ActionResult } from '@/server/actions'
import { CONTRACT_LABELS, REASON_LABELS } from '@/modules/requisitions/schema'

export interface RequisitionDefaults {
  title?: string
  departmentId?: string | null
  location?: string
  contractType?: string
  headcount?: number
  salaryMin?: string | null
  salaryMax?: string | null
  reason?: string
  justification?: string
  requirementsMust?: string
  requirementsNice?: string
  competencies?: string
}

export function RequisitionForm({
  action,
  departments,
  defaults = {},
  submitLabel,
}: {
  action: (state: ActionResult<unknown> | null, form: FormData) => Promise<ActionResult<unknown>>
  departments: { id: string; name: string }[]
  defaults?: RequisitionDefaults
  submitLabel: string
}) {
  return (
    <ActionForm action={action} className="grid max-w-4xl grid-cols-1 gap-5 md:grid-cols-2">
      <Field name="title" label="Função" className="md:col-span-2">
        <input id="title" name="title" className="input" defaultValue={defaults.title} placeholder="Ex.: Fiel de Armazém" required />
      </Field>
      <Field name="departmentId" label="Departamento">
        <select id="departmentId" name="departmentId" className="select" defaultValue={defaults.departmentId ?? ''}>
          <option value="">— Sem departamento —</option>
          {departments.map((department) => (
            <option key={department.id} value={department.id}>
              {department.name}
            </option>
          ))}
        </select>
      </Field>
      <Field name="location" label="Localização">
        <input id="location" name="location" className="input" defaultValue={defaults.location} placeholder="Ex.: Matola, Maputo" required />
      </Field>
      <Field name="contractType" label="Tipo de contrato">
        <select id="contractType" name="contractType" className="select" defaultValue={defaults.contractType ?? ''} required>
          <option value="" disabled>
            Escolha…
          </option>
          {Object.entries(CONTRACT_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      <Field name="headcount" label="N.º de vagas">
        <input id="headcount" name="headcount" type="number" min={1} max={500} className="input" defaultValue={defaults.headcount ?? 1} required />
      </Field>
      <Field name="salaryMin" label="Salário mínimo (MZN/mês)" hint="Opcional. Orçamentos acima de 100.000 MZN pedem aprovação da Direcção.">
        <input id="salaryMin" name="salaryMin" inputMode="numeric" className="input" defaultValue={defaults.salaryMin ?? ''} />
      </Field>
      <Field name="salaryMax" label="Salário máximo (MZN/mês)">
        <input id="salaryMax" name="salaryMax" inputMode="numeric" className="input" defaultValue={defaults.salaryMax ?? ''} />
      </Field>
      <Field name="reason" label="Motivo">
        <select id="reason" name="reason" className="select" defaultValue={defaults.reason ?? ''} required>
          <option value="" disabled>
            Escolha…
          </option>
          {Object.entries(REASON_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      <Field name="justification" label="Justificação da necessidade" className="md:col-span-2" hint="Interna: visível apenas para quem aprova.">
        <textarea id="justification" name="justification" className="textarea" defaultValue={defaults.justification} required />
      </Field>
      <Field name="requirementsMust" label="Requisitos obrigatórios" hint="Um por linha. Escreva o que se pode verificar num CV (formação, carta, experiência)." className="md:col-span-2">
        <textarea id="requirementsMust" name="requirementsMust" className="textarea" defaultValue={defaults.requirementsMust} />
      </Field>
      <Field name="requirementsNice" label="Requisitos desejáveis" hint="Um por linha. Opcional." className="md:col-span-2">
        <textarea id="requirementsNice" name="requirementsNice" className="textarea" defaultValue={defaults.requirementsNice} />
      </Field>
      <Field name="competencies" label="Competências a avaliar na entrevista" hint='Uma por linha, no formato "Nome: o que se observa". Tornam-se os critérios do scorecard.' className="md:col-span-2">
        <textarea id="competencies" name="competencies" className="textarea" defaultValue={defaults.competencies} />
      </Field>
      <div className="md:col-span-2">
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </ActionForm>
  )
}
