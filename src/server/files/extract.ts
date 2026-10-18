import type { DetectedType } from './scan'

const MAX_TEXT_CHARS = 100_000

/** Texto do CV para pesquisa e evidência. Imagens e falhas devolvem null: o ficheiro fica preservado para leitura humana. */
export async function extractText(data: Uint8Array, type: DetectedType): Promise<string | null> {
  try {
    if (type === 'pdf') {
      const { extractText: extractPdf, getDocumentProxy } = await import('unpdf')
      const pdf = await getDocumentProxy(new Uint8Array(data))
      const { text } = await extractPdf(pdf, { mergePages: true })
      return clean(Array.isArray(text) ? text.join('\n') : text)
    }
    if (type === 'docx') {
      const mammoth = await import('mammoth')
      const result = await mammoth.extractRawText({ buffer: Buffer.from(data) })
      return clean(result.value)
    }
    return null
  } catch (error: unknown) {
    console.warn('[extract] falha na extracção de texto', error instanceof Error ? error.message : error)
    return null
  }
}

function clean(text: string): string | null {
  const normalized = text.replace(/\u0000/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
  return normalized.length >= 20 ? normalized.slice(0, MAX_TEXT_CHARS) : null
}
