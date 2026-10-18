import { describe, expect, it } from 'vitest'
import { detectType, safeFilename, scanUpload } from '@/server/files/scan'
import { normalizePhone, slugify } from '@/lib/text'
import { utcToZonedLocal, zonedLocalToUtc } from '@/lib/time'
import { can, permissionsFor, ROLES } from '@/server/auth/rbac'
import { nextAttemptDelayMinutes, renderTemplate } from '@/modules/communications/render'
import { parseScreeningQuestions, serializeScreeningQuestions } from '@/modules/vacancies/schema'

const bytes = (value: string) => new TextEncoder().encode(value)

describe('verificação de ficheiros', () => {
  it('identifica o tipo pelo conteúdo, não pela extensão', () => {
    expect(detectType(bytes('%PDF-1.4 ...'))).toBe('pdf')
    expect(detectType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('png')
    expect(scanUpload(bytes('texto simples')).status).toBe('rejected')
  })

  it('bloqueia executáveis, EICAR e PDF com JavaScript', () => {
    expect(scanUpload(bytes('MZ\x90\x00')).status).toBe('infected')
    expect(scanUpload(bytes('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*')).status).toBe('infected')
    expect(scanUpload(bytes('%PDF-1.4 /OpenAction << /S /JavaScript /JS (app.alert(1)) >>')).status).toBe('infected')
    expect(scanUpload(bytes('%PDF-1.4 conteúdo normal')).status).toBe('clean')
  })

  it('limpa nomes de ficheiro de caminhos e caracteres de controlo', () => {
    expect(safeFilename('../../etc/pass\u0000wd.pdf', 'pdf')).toBe('passwd.pdf')
    expect(safeFilename('CV Joana Macuácua.PDF', 'pdf')).toBe('CV Joana Macuácua.pdf')
  })
})

describe('texto e tempo', () => {
  it('normaliza telefones moçambicanos para E.164', () => {
    expect(normalizePhone('84 123 4567')).toBe('+258841234567')
    expect(normalizePhone('00258 82 765 4321')).toBe('+258827654321')
    expect(normalizePhone('+351 912 345 678')).toBe('+351912345678')
    expect(normalizePhone('123')).toBeNull()
  })

  it('gera slugs sem acentos', () => {
    expect(slugify('Técnico(a) de HSE — Obras')).toBe('tecnico-a-de-hse-obras')
  })

  it('converte hora de Maputo (UTC+2) e de Lisboa (com hora de Verão)', () => {
    expect(zonedLocalToUtc('2026-10-21T10:00').toISOString()).toBe('2026-10-21T08:00:00.000Z')
    expect(utcToZonedLocal(new Date('2026-10-21T08:00:00Z'))).toBe('2026-10-21T10:00')
    expect(zonedLocalToUtc('2026-07-01T10:00', 'Europe/Lisbon').toISOString()).toBe('2026-07-01T09:00:00.000Z')
    expect(zonedLocalToUtc('2026-12-01T10:00', 'Europe/Lisbon').toISOString()).toBe('2026-12-01T10:00:00.000Z')
  })
})

describe('papéis, mensagens e perguntas', () => {
  it('apenas administradores gerem a organização; entrevistadores têm acesso mínimo', () => {
    expect(ROLES.filter((role) => can(role, 'org.manage'))).toEqual(['org_admin'])
    expect(permissionsFor('interviewer')).toEqual(['interview.view_assigned', 'scorecard.submit'])
    expect(can('executive', 'candidate.view')).toBe(false)
    expect(can('privacy_officer', 'application.decide')).toBe(false)
  })

  it('preenche modelos sem expor variáveis desconhecidas', () => {
    expect(renderTemplate('Olá {{candidato}} — {{inexistente}}fim', { candidato: 'Ana' })).toBe('Olá Ana — fim')
  })

  it('repete envios com backoff e passa a dead-letter na 5.ª falha', () => {
    expect([1, 2, 3, 4, 5].map(nextAttemptDelayMinutes)).toEqual([1, 5, 30, 120, null])
  })

  it('perguntas de elegibilidade fazem ida e volta', () => {
    const text = 'S/N Tem carta?\nS/N! Teve suspensão?\n? Onde trabalhou?'
    const questions = parseScreeningQuestions(text)
    expect(questions.map((question) => [question.kind, question.expected, question.required])).toEqual([
      ['yes_no', 'yes', true],
      ['yes_no', 'no', true],
      ['text', undefined, false],
    ])
    expect(serializeScreeningQuestions(questions)).toBe(text)
  })
})
