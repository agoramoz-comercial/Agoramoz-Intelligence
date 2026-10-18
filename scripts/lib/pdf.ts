/**
 * Gerador mínimo de PDF de texto (uma página, Helvetica, WinAnsi) para dados de demonstração e testes.
 * Produz um ficheiro válido que os leitores de PDF e a extracção de texto do produto conseguem ler.
 */
function escapePdfText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}

export function textPdf(lines: readonly string[]): Uint8Array {
  const content = ['BT', '/F1 11 Tf', '14 TL', '56 780 Td', ...lines.map((line) => `(${escapePdfText(line)}) '`), 'ET'].join('\n')
  const contentBytes = Buffer.from(content, 'latin1')
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    `<< /Length ${contentBytes.length} >>\nstream\n${content}\nendstream`,
  ]
  let body = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n'
  const offsets: number[] = []
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body, 'latin1'))
    body += `${index + 1} 0 obj\n${object}\nendobj\n`
  })
  const xrefOffset = Buffer.byteLength(body, 'latin1')
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  body += offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  return new Uint8Array(Buffer.from(body, 'latin1'))
}
