'use client'

import { useActionState } from 'react'
import type { ActionResult } from '@/server/actions'
import type { ImportReport } from '@/modules/candidates/import'

export function ImportForm({ action, vacancies, defaultVacancy }: { action: (state: ActionResult<ImportReport> | null, form: FormData) => Promise<ActionResult<ImportReport>>; vacancies: { id: string; title: string }[]; defaultVacancy?: string }) {
  const [state, run, pending] = useActionState(action, null)
  const report = state?.ok ? state.data : null
  return (
    <div className="space-y-6">
      <form action={run} className="grid max-w-3xl grid-cols-1 gap-5">
        <div>
          <label className="label" htmlFor="csv">
            Ficheiro CSV (Excel: Ficheiro › Guardar como › CSV UTF-8)
          </label>
          <input id="csv" name="csv" type="file" accept=".csv,text/csv" className="input" required />
          <p className="hint">Colunas reconhecidas: nome, email, telefone, localidade, origem (email, whatsapp, referencia), talent_pool (sim/não). Separador vírgula ou ponto e vírgula.</p>
        </div>
        <div>
          <label className="label" htmlFor="vacancyId">
            Associar à vaga
          </label>
          <select id="vacancyId" name="vacancyId" className="select" defaultValue={defaultVacancy ?? ''}>
            <option value="">— Sem vaga (espontâneas) —</option>
            {vacancies.map((vacancy) => (
              <option key={vacancy.id} value={vacancy.id}>
                {vacancy.title}
              </option>
            ))}
          </select>
        </div>
        <label className="check">
          <input type="checkbox" name="consentConfirmed" />
          <span>Confirmo que estes candidatos autorizaram o tratamento dos dados quando enviaram a candidatura (necessário para importar).</span>
        </label>
        {state && !state.ok ? (
          <p role="alert" className="rounded-md bg-[var(--danger-bg)] px-3 py-2 text-sm font-medium text-[var(--danger)]">
            {state.error}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-quiet" type="submit" name="intent" value="dry-run" disabled={pending}>
            {pending ? 'A validar…' : 'Validar sem gravar'}
          </button>
          <button className="btn" type="submit" name="intent" value="import" disabled={pending}>
            Importar linhas válidas
          </button>
        </div>
      </form>

      {report ? (
        <section className="panel p-5" aria-live="polite">
          <h2 className="text-[16px] font-semibold">{report.dryRun ? 'Relatório de validação (nada foi gravado)' : 'Importação concluída'}</h2>
          <p className="mt-1 text-[14px]">
            {report.totalRows} linha(s): <strong>{report.valid} válida(s)</strong>, {report.invalid} com erro
            {!report.dryRun ? `, ${report.imported} importada(s), ${report.duplicatesSuggested} sugestão(ões) de duplicado` : ''}.
          </p>
          <div className="mt-3 max-h-[480px] overflow-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Linha</th>
                  <th>Nome</th>
                  <th>Resultado</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((row) => (
                  <tr key={row.line}>
                    <td className="nums">{row.line}</td>
                    <td>{row.name}</td>
                    <td className="text-[13.5px]">
                      {row.ok ? <span className="badge badge-ok">Válida</span> : <span className="badge badge-danger">Erro</span>}
                      {row.errors.map((error) => (
                        <span key={error} className="block text-[var(--danger)]">
                          {error}
                        </span>
                      ))}
                      {row.warnings.map((warning) => (
                        <span key={warning} className="block text-[var(--warn)]">
                          {warning}
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  )
}
