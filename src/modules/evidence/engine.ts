import { normalizeText, truncate } from '@/lib/text'
import type { Requirement } from '@/modules/requisitions/schema'
import type { ScreeningQuestion } from '@/modules/vacancies/schema'

/**
 * Verificação automática de evidência textual (determinística, sem IA).
 *
 * Política (Blueprint §7.3): nunca pontua candidatos nem rejeita. Para cada requisito indica se o texto do CV
 * contém evidência e cita o excerto, para que uma pessoa valide. O resultado é uma frase verificável:
 * "Evidência encontrada para 4 de 5 requisitos obrigatórios; não encontrado: …".
 */

export const EVIDENCE_ENGINE_VERSION = 'evidence-v1'

export interface RequirementEvidence {
  requirementId: string
  text: string
  kind: 'must' | 'nice'
  found: boolean
  /** Termos encontrados mas sem a quantidade pedida (ex.: "3 anos"): confirmar com o candidato. */
  partial: boolean
  snippet: string | null
  matchedTerms: string[]
}

export interface AnswerFlag {
  questionId: string
  question: string
  answer: string
  expected: 'yes' | 'no'
}

export interface EvidenceReport {
  version: string
  hasText: boolean
  requirements: RequirementEvidence[]
  mustTotal: number
  mustFound: number
  niceTotal: number
  niceFound: number
  answerFlags: AnswerFlag[]
  statement: string
}

const STOPWORDS = new Set(
  'a ao aos as com como da das de do dos e em entre na nas no nos o os ou para pela pelas pelo pelos por que se sem sob sobre um uma uns umas ter tem minimo minima pelo menos anos ano experiencia conhecimento conhecimentos capacidade bom boa boas bons nivel area areas func funcao'
    .split(' '),
)

/** Radical simples para português: tolera plural e variações de sufixo ("conduzir"/"condução" não coincidem de propósito). */
function stem(token: string): string {
  return token.length > 5 ? token.slice(0, Math.max(5, token.length - 3)) : token
}

function tokenize(text: string): string[] {
  return normalizeText(text).split(/[^a-z0-9+#]+/).filter(Boolean)
}

/** Termos-chave (palavras com significado) de um requisito. */
export function keyTerms(text: string): string[] {
  return [...new Set(tokenize(text).filter((token) => !/^\d+$/.test(token) && token.length >= 3 && !STOPWORDS.has(token)))]
}

/** Quantidades do requisito (anos, níveis); não decidem a evidência mas tornam-na parcial se faltarem. */
export function quantities(text: string): string[] {
  return [...new Set(tokenize(text).filter((token) => /^\d+$/.test(token)))]
}

function segments(cvText: string): { raw: string; tokens: string[] }[] {
  return cvText
    .split(/\r?\n|(?<=[.;•])\s+/)
    .map((raw) => raw.trim())
    .filter((raw) => raw.length > 2)
    .map((raw) => ({ raw, tokens: tokenize(raw) }))
}

function termMatches(term: string, tokens: readonly string[]): boolean {
  const termStem = stem(term)
  return tokens.some((token) => token.startsWith(termStem) || (stem(token).length >= 4 && term.startsWith(stem(token))))
}

/** Proporção mínima de termos-chave numa mesma frase para contar como evidência. */
function requiredCoverage(termCount: number): number {
  return termCount <= 2 ? termCount : Math.ceil(termCount * 0.6)
}

/** "Experiência em armazém ou gestão de stocks" → duas alternativas; basta uma ter evidência. */
export function alternatives(text: string): string[] {
  const parts = text.split(/\s+ou\s+|\s*\/\s*/i).map((part) => part.trim()).filter((part) => keyTerms(part).length > 0)
  return parts.length >= 2 ? parts : [text]
}

function bestMatch(terms: readonly string[], cvSegments: ReturnType<typeof segments>): { raw: string; matched: string[] } | null {
  let best: { raw: string; matched: string[] } | null = null
  for (const segment of cvSegments) {
    const matched = terms.filter((term) => termMatches(term, segment.tokens))
    if (!best || matched.length > best.matched.length) best = { raw: segment.raw, matched }
  }
  return best
}

export function findEvidence(requirement: Requirement, cvSegments: ReturnType<typeof segments>): RequirementEvidence {
  const candidates = alternatives(requirement.text).map((alternative) => {
    const terms = keyTerms(alternative)
    const match = bestMatch(terms, cvSegments)
    const found = terms.length > 0 && match !== null && match.matched.length >= requiredCoverage(terms.length)
    return { found, match, coverage: terms.length ? (match?.matched.length ?? 0) / terms.length : 0 }
  })
  const chosen = candidates.find((candidate) => candidate.found) ?? [...candidates].sort((a, b) => b.coverage - a.coverage)[0]
  const best = chosen?.match ?? null
  const found = chosen?.found ?? false
  const bestTokens = best ? tokenize(best.raw) : []
  const partial = found && quantities(requirement.text).some((quantity) => !bestTokens.includes(quantity))
  return {
    requirementId: requirement.id,
    text: requirement.text,
    kind: requirement.kind,
    found,
    partial,
    snippet: found && best ? truncate(best.raw, 220) : null,
    matchedTerms: found && best ? best.matched : [],
  }
}

export function flagAnswers(questions: readonly ScreeningQuestion[], answers: readonly { questionId: string; answer: string }[]): AnswerFlag[] {
  return questions.flatMap((question) => {
    if (question.kind !== 'yes_no' || !question.expected) return []
    const given = answers.find((answer) => answer.questionId === question.id)?.answer
    if (!given || given === question.expected) return []
    return [{ questionId: question.id, question: question.text, answer: given, expected: question.expected }]
  })
}

function quoteList(items: readonly string[]): string {
  return items.map((item) => `"${truncate(item, 60)}"`).join(', ')
}

export function buildStatement(report: Omit<EvidenceReport, 'statement' | 'version'>): string {
  if (!report.hasText) {
    return 'CV sem texto extraível (imagem, digitalização ou formato antigo). Requer leitura humana do documento.'
  }
  const missing = report.requirements.filter((item) => item.kind === 'must' && !item.found).map((item) => item.text)
  const parts = [`Evidência textual encontrada para ${report.mustFound} de ${report.mustTotal} requisitos obrigatórios`]
  if (missing.length > 0) parts.push(`não encontrado: ${quoteList(missing)}`)
  const partial = report.requirements.filter((item) => item.partial).length
  if (partial > 0) parts.push(`${partial} com quantidade (anos, nível) a confirmar`)
  if (report.niceTotal > 0) parts.push(`${report.niceFound} de ${report.niceTotal} desejáveis`)
  if (report.answerFlags.length > 0) parts.push(`${report.answerFlags.length} resposta(s) de elegibilidade diferente(s) do esperado`)
  return `${parts.join('; ')}. Requer validação humana.`
}

export function analyzeEvidence(input: {
  requirements: readonly Requirement[]
  cvText: string | null
  questions?: readonly ScreeningQuestion[]
  answers?: readonly { questionId: string; answer: string }[]
}): EvidenceReport {
  const cvSegments = input.cvText ? segments(input.cvText) : []
  const hasText = cvSegments.length > 0
  const requirements = input.requirements.map((requirement) =>
    hasText
      ? findEvidence(requirement, cvSegments)
      : { requirementId: requirement.id, text: requirement.text, kind: requirement.kind, found: false, partial: false, snippet: null, matchedTerms: [] },
  )
  const must = requirements.filter((item) => item.kind === 'must')
  const nice = requirements.filter((item) => item.kind === 'nice')
  const base = {
    hasText,
    requirements,
    mustTotal: must.length,
    mustFound: must.filter((item) => item.found).length,
    niceTotal: nice.length,
    niceFound: nice.filter((item) => item.found).length,
    answerFlags: flagAnswers(input.questions ?? [], input.answers ?? []),
  }
  return { version: EVIDENCE_ENGINE_VERSION, ...base, statement: buildStatement(base) }
}
