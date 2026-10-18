import type { Tx } from '@/server/db/client'
import type { Requirement } from '@/modules/requisitions/schema'
import type { ScreeningQuestion } from '@/modules/vacancies/schema'
import { analyzeEvidence, type EvidenceReport } from './engine'

/** Recalcula a evidência de uma candidatura com o CV mais recente e os requisitos da versão vista pelo candidato. */
export async function refreshEvidence(tx: Tx, applicationId: string): Promise<EvidenceReport | null> {
  const [row] = await tx<{ requirements: Requirement[] | null; questions: ScreeningQuestion[] | null; answers: { questionId: string; answer: string }[]; cvText: string | null }[]>`
    select vv.requirements, vv.screening_questions as questions, a.answers,
      (select f.text_content from candidate_files f where f.candidate_id = a.candidate_id and f.kind = 'cv' and f.scan_status = 'clean'
        order by (f.application_id = a.id) desc nulls last, f.created_at desc limit 1) as cv_text
    from applications a left join vacancy_versions vv on vv.id = a.vacancy_version_id
    where a.id = ${applicationId}
  `
  if (!row?.requirements) return null
  const report = analyzeEvidence({ requirements: row.requirements, cvText: row.cvText, questions: row.questions ?? [], answers: row.answers })
  await tx`update applications set evidence = ${tx.json(report as never)} where id = ${applicationId}`
  return report
}
