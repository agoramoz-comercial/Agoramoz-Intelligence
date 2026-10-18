import type { Metadata } from 'next'
import { requirePermission } from '@/server/auth/current'
import { listVacancies } from '@/modules/vacancies/service'
import { SOURCE_LABELS, APPLICATION_SOURCES } from '@/modules/applications/intake'
import { ActionForm, Field, FieldError, SubmitButton } from '@/components/form'
import { PageHeader } from '@/components/ui'
import { createManualAction } from '../actions'

export const metadata: Metadata = { title: 'Registar candidatura' }

export default async function NewCandidatePage({ searchParams }: { searchParams: Promise<{ vaga?: string }> }) {
  const ctx = await requirePermission('candidate.manage')
  const { vaga } = await searchParams
  const vacancies = await listVacancies(ctx, 'published')
  return (
    <>
      <PageHeader
        back={{ href: '/app/candidatos', label: 'Candidatos' }}
        title="Registar candidatura recebida fora da página"
        description="Para candidaturas que chegam por email, WhatsApp ou referência interna: ficam no mesmo fluxo, com origem registada, evidência e auditoria."
      />
      <div className="panel p-6">
        <ActionForm action={createManualAction} className="grid max-w-3xl grid-cols-1 gap-5 md:grid-cols-2">
          <Field name="fullName" label="Nome completo" className="md:col-span-2">
            <input id="fullName" name="fullName" className="input" required />
          </Field>
          <Field name="email" label="Email">
            <input id="email" name="email" type="email" className="input" />
          </Field>
          <Field name="phone" label="Telefone" hint="Ex.: 84 123 4567">
            <input id="phone" name="phone" inputMode="tel" className="input" />
          </Field>
          <Field name="location" label="Localidade">
            <input id="location" name="location" className="input" />
          </Field>
          <Field name="source" label="Canal de origem">
            <select id="source" name="source" className="select" defaultValue="whatsapp">
              {APPLICATION_SOURCES.filter((source) => source !== 'careers_page' && source !== 'spontaneous' && source !== 'import').map((source) => (
                <option key={source} value={source}>
                  {SOURCE_LABELS[source]}
                </option>
              ))}
            </select>
          </Field>
          <Field name="vacancyId" label="Vaga" className="md:col-span-2" hint="Sem vaga, fica como candidatura espontânea.">
            <select id="vacancyId" name="vacancyId" className="select" defaultValue={vaga ?? ''}>
              <option value="">— Candidatura espontânea —</option>
              {vacancies.map((vacancy) => (
                <option key={vacancy.id} value={vacancy.id}>
                  {vacancy.title}
                </option>
              ))}
            </select>
          </Field>
          <Field name="cv" label="CV (opcional)" className="md:col-span-2" hint="PDF, DOCX, DOC, ODT, JPG ou PNG até 5 MB. O ficheiro é verificado antes de ficar disponível.">
            <input id="cv" name="cv" type="file" accept=".pdf,.doc,.docx,.odt,.jpg,.jpeg,.png" className="input" />
          </Field>
          <Field name="coverNote" label="Notas da recepção" className="md:col-span-2">
            <textarea id="coverNote" name="coverNote" className="textarea" rows={3} placeholder="Ex.: recebida por WhatsApp no número da obra." />
          </Field>
          <div className="space-y-2 md:col-span-2">
            <label className="check">
              <input type="checkbox" name="consentConfirmed" />
              <span>Confirmo que o candidato autorizou o tratamento dos dados para este processo e foi informado da política de privacidade.</span>
            </label>
            <FieldError name="consentConfirmed" />
            <label className="check">
              <input type="checkbox" name="consentTalentPool" />
              <span>O candidato autorizou também a conservação para futuras oportunidades (talent pool).</span>
            </label>
            <label className="check">
              <input type="checkbox" name="notifyCandidate" />
              <span>Enviar confirmação por email ao candidato</span>
            </label>
          </div>
          <div className="md:col-span-2">
            <SubmitButton pendingLabel="A registar…">Registar candidatura</SubmitButton>
          </div>
        </ActionForm>
      </div>
    </>
  )
}
