import { describe, expect, it } from 'vitest'
import { canSeeOthersFeedback, consolidate } from '@/modules/interviews/consolidation'

const competencies = [
  { id: 'c1', name: 'Rigor', description: '' },
  { id: 'c2', name: 'Segurança', description: '' },
]

describe('consolidação de scorecards', () => {
  it('calcula intervalo, média e assinala discordância de 2+ pontos', () => {
    const result = consolidate(competencies, [
      { authorId: 'a', authorName: 'A', recommendation: 'yes', summary: null, ratings: [{ competencyId: 'c1', rating: 4, evidence: 'Explicou o inventário mensal.' }, { competencyId: 'c2', rating: 3, evidence: 'ok' }] },
      { authorId: 'b', authorName: 'B', recommendation: 'no', summary: null, ratings: [{ competencyId: 'c1', rating: 2, evidence: 'Pouca experiência de registo.' }, { competencyId: 'c2', rating: 3, evidence: 'Cumpriu as normas de EPI.' }] },
    ])
    expect(result.competencies[0]).toMatchObject({ min: 2, max: 4, mean: 3, disagreement: true })
    expect(result.competencies[1]).toMatchObject({ disagreement: false, missingEvidence: 1 })
    expect(result.recommendationSplit).toBe(true)
  })

  it('oculta feedback a participantes que ainda não submeteram', () => {
    expect(canSeeOthersFeedback({ hideUntilSubmitted: true, viewerHasViewAll: true, viewerIsParticipant: true, viewerSubmitted: false })).toBe(false)
    expect(canSeeOthersFeedback({ hideUntilSubmitted: true, viewerHasViewAll: true, viewerIsParticipant: true, viewerSubmitted: true })).toBe(true)
    expect(canSeeOthersFeedback({ hideUntilSubmitted: false, viewerHasViewAll: false, viewerIsParticipant: true, viewerSubmitted: true })).toBe(false)
    expect(canSeeOthersFeedback({ hideUntilSubmitted: true, viewerHasViewAll: true, viewerIsParticipant: false, viewerSubmitted: false })).toBe(true)
  })
})
