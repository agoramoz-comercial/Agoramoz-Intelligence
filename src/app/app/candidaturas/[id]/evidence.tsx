import type { EvidenceReport } from '@/modules/evidence/engine'
import type { ScreeningQuestion } from '@/modules/vacancies/schema'

export function EvidencePanel({ evidence }: { evidence: EvidenceReport | null }) {
  if (!evidence) return <p className="text-[var(--muted)]">Sem verificação de evidência (candidatura espontânea ou sem requisitos publicados).</p>
  return (
    <div>
      <p className="rounded-lg bg-[var(--surface)] p-3 text-[15px] font-medium">{evidence.statement}</p>
      <ul className="mt-3 divide-y divide-[var(--grid)]">
        {evidence.requirements.map((item) => (
          <li key={item.requirementId} className="grid grid-cols-[auto_1fr] gap-3 py-2.5">
            <span className={`badge ${item.found ? (item.partial ? 'badge-warn' : 'badge-ok') : 'badge-danger'}`}>
              {item.found ? (item.partial ? 'Parcial' : 'Encontrado') : 'Não encontrado'}
            </span>
            <div>
              <p className="text-[14.5px]">
                {item.text} <span className="text-[12.5px] text-[var(--muted)]">({item.kind === 'must' ? 'obrigatório' : 'desejável'})</span>
              </p>
              {item.snippet ? <blockquote className="mt-1 border-l-2 border-[var(--line)] pl-2 text-[13.5px] text-[var(--muted)]">“{item.snippet}”</blockquote> : null}
              {item.partial ? <p className="mt-1 text-[12.5px] text-[var(--warn)]">Confirmar quantidade (anos, nível) com o candidato.</p> : null}
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[12px] text-[var(--muted)]">
        Verificação textual automática ({evidence.version}). Indica onde procurar no CV; não pontua nem rejeita. A decisão é sempre humana.
      </p>
    </div>
  )
}

export function AnswersPanel({ questions, answers }: { questions: ScreeningQuestion[]; answers: { questionId: string; answer: string }[] }) {
  if (questions.length === 0) return null
  return (
    <dl className="space-y-3">
      {questions.map((question) => {
        const answer = answers.find((item) => item.questionId === question.id)?.answer
        const differs = question.kind === 'yes_no' && question.expected && answer && answer !== question.expected
        const display = question.kind === 'yes_no' ? (answer === 'yes' ? 'Sim' : answer === 'no' ? 'Não' : '—') : (answer || '—')
        return (
          <div key={question.id}>
            <dt className="text-[13px] font-semibold text-[var(--muted)]">{question.text}</dt>
            <dd className="mt-0.5 flex items-center gap-2">
              <span>{display}</span>
              {differs ? <span className="badge badge-warn">Diferente do esperado: confirmar</span> : null}
            </dd>
          </div>
        )
      })}
    </dl>
  )
}
