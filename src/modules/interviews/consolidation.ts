import type { Competency } from '@/modules/requisitions/schema'

export const RATING_LABELS: Record<number, string> = {
  1: 'Não demonstrado',
  2: 'Parcialmente demonstrado',
  3: 'Demonstrado',
  4: 'Demonstrado com forte evidência',
}

export const RECOMMENDATION_LABELS = {
  strong_yes: 'Avançar com convicção',
  yes: 'Avançar',
  no: 'Não avançar',
  strong_no: 'Não avançar de todo',
} as const

export type Recommendation = keyof typeof RECOMMENDATION_LABELS

export interface Rating {
  competencyId: string
  rating: number
  evidence: string
}

export interface SubmittedScorecard {
  authorId: string
  authorName: string
  ratings: Rating[]
  recommendation: Recommendation
  summary: string | null
}

export interface CompetencySummary {
  competency: Competency
  entries: { authorName: string; rating: number; evidence: string }[]
  min: number | null
  max: number | null
  mean: number | null
  /** Diferença ≥ 2 pontos entre avaliadores: a decisão deve discutir esta competência. */
  disagreement: boolean
  missingEvidence: number
}

export interface Consolidation {
  competencies: CompetencySummary[]
  recommendations: Record<Recommendation, number>
  recommendationSplit: boolean
  submitted: number
}

const DISAGREEMENT_GAP = 2

export function consolidate(competencies: readonly Competency[], scorecards: readonly SubmittedScorecard[]): Consolidation {
  const summaries = competencies.map((competency) => {
    const entries = scorecards.flatMap((card) => {
      const rating = card.ratings.find((item) => item.competencyId === competency.id)
      return rating ? [{ authorName: card.authorName, rating: rating.rating, evidence: rating.evidence }] : []
    })
    const values = entries.map((entry) => entry.rating)
    const min = values.length ? Math.min(...values) : null
    const max = values.length ? Math.max(...values) : null
    return {
      competency,
      entries,
      min,
      max,
      mean: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null,
      disagreement: min !== null && max !== null && max - min >= DISAGREEMENT_GAP,
      missingEvidence: entries.filter((entry) => entry.evidence.trim().length < 10).length,
    }
  })
  const recommendations: Record<Recommendation, number> = { strong_yes: 0, yes: 0, no: 0, strong_no: 0 }
  for (const card of scorecards) recommendations[card.recommendation]++
  const positive = recommendations.strong_yes + recommendations.yes
  const negative = recommendations.no + recommendations.strong_no
  return { competencies: summaries, recommendations, recommendationSplit: positive > 0 && negative > 0, submitted: scorecards.length }
}

/** Esconde o feedback dos outros a quem ainda tem o seu por submeter (evita enviesamento). */
export function canSeeOthersFeedback(args: {
  hideUntilSubmitted: boolean
  viewerHasViewAll: boolean
  viewerIsParticipant: boolean
  viewerSubmitted: boolean
}): boolean {
  if (args.viewerIsParticipant && args.hideUntilSubmitted && !args.viewerSubmitted) return false
  return args.viewerHasViewAll
}
