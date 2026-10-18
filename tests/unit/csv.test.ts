import { describe, expect, it } from 'vitest'
import { parseCsv, toCsv } from '@/lib/csv'
import { parseImport } from '@/modules/candidates/import'

describe('CSV', () => {
  it('lê aspas, separador ; do Excel português e quebras dentro de campos', () => {
    expect(parseCsv('﻿nome;nota\n"Silva; Ana";"linha 1\nlinha 2"\n')).toEqual([
      ['nome', 'nota'],
      ['Silva; Ana', 'linha 1\nlinha 2'],
    ])
  })

  it('neutraliza injecção de fórmulas ao exportar', () => {
    const csv = toCsv(['a'], [['=HYPERLINK("x")'], ['+1'], ['normal']])
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`)
    expect(csv).toContain("'+1")
    expect(csv).toContain('normal')
  })

  it('reconhece cabeçalhos em português e assinala repetidos', () => {
    const { parsed, report } = parseImport('Nome completo,E-mail,Telemóvel\nAna Silva,ana@x.test,841112233\nAna Silva,ana@x.test,\n')
    expect(report.missingColumns).toEqual([])
    expect(parsed).toHaveLength(2)
    expect(parsed[0]).toMatchObject({ fullName: 'Ana Silva', email: 'ana@x.test', phone: '+258841112233', source: 'import' })
    expect(report.rows[1]?.warnings[0]).toMatch(/Repetido/)
  })
})
