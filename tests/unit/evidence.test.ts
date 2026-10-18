import { describe, expect, it } from 'vitest'
import { analyzeEvidence, keyTerms } from '@/modules/evidence/engine'
import type { Requirement } from '@/modules/requisitions/schema'

const requirements: Requirement[] = [
  { id: 'r1', text: 'Carta de condução profissional', kind: 'must' },
  { id: 'r2', text: '3 anos de experiência em armazém', kind: 'must' },
  { id: 'r3', text: 'Ensino médio concluído', kind: 'must' },
  { id: 'r4', text: 'Certificação em empilhadores', kind: 'must' },
  { id: 'r5', text: 'Inglês básico', kind: 'nice' },
]

const cv = `Joana Macuácua
Fiel de armazém — Distribuidora do Sul, Matola (2021–2024)
Possuo carta de condução profissional (categoria C).
Ensino Médio concluído na Escola Secundária Josina Machel.
Línguas: Português, Changana e Inglês básico.`

describe('analyzeEvidence', () => {
  it('cites the CV excerpt for each requirement it finds', () => {
    const report = analyzeEvidence({ requirements, cvText: cv })
    const licence = report.requirements.find((item) => item.requirementId === 'r1')
    expect(licence?.found).toBe(true)
    expect(licence?.snippet).toContain('carta de condução profissional')
  })

  it('states coverage as "N de M" and names what is missing, never a score', () => {
    const report = analyzeEvidence({ requirements, cvText: cv })
    expect(report.mustTotal).toBe(4)
    expect(report.mustFound).toBe(3)
    expect(report.statement).toContain('3 de 4 requisitos obrigatórios')
    expect(report.statement).toContain('Certificação em empilhadores')
    expect(report.statement).toContain('Requer validação humana')
    expect(report.statement).not.toMatch(/%/)
  })

  it('marks evidence as partial when the required quantity is not in the excerpt', () => {
    const report = analyzeEvidence({ requirements, cvText: cv })
    const experience = report.requirements.find((item) => item.requirementId === 'r2')
    expect(experience?.found).toBe(true)
    expect(experience?.partial).toBe(true)
  })

  it('asks for human reading when the CV has no extractable text', () => {
    const report = analyzeEvidence({ requirements, cvText: null })
    expect(report.hasText).toBe(false)
    expect(report.mustFound).toBe(0)
    expect(report.statement).toMatch(/leitura humana/)
  })

  it('flags eligibility answers that differ from the expected one without rejecting', () => {
    const report = analyzeEvidence({
      requirements,
      cvText: cv,
      questions: [{ id: 'q1', text: 'Tem disponibilidade para turnos?', kind: 'yes_no', required: true, expected: 'yes' }],
      answers: [{ questionId: 'q1', answer: 'no' }],
    })
    expect(report.answerFlags).toHaveLength(1)
    expect(report.statement).toContain('elegibilidade')
  })

  it('ignores stopwords and accents when extracting key terms', () => {
    expect(keyTerms('Experiência mínima em gestão de stocks')).toEqual(['gestao', 'stocks'])
  })
})

describe('alternatives in requirements', () => {
  it('accepts evidence for any alternative joined by "ou"', () => {
    const report = analyzeEvidence({
      requirements: [{ id: 'x', text: 'Experiência em armazém ou gestão de stocks', kind: 'must' }],
      cvText: 'Ajudante de armazem - Ferragens Central (2019-2023)',
    })
    expect(report.requirements[0]?.found).toBe(true)
    expect(report.requirements[0]?.snippet).toContain('armazem')
  })

  it('still reports missing evidence when no alternative is present', () => {
    const report = analyzeEvidence({
      requirements: [{ id: 'x', text: 'Experiência em armazém ou gestão de stocks', kind: 'must' }],
      cvText: 'Caixa de supermercado (2020-2024)\nAtendimento ao cliente',
    })
    expect(report.requirements[0]?.found).toBe(false)
  })
})
