/**
 * Verificação de ficheiros carregados (Blueprint §8.1: allowlist de tipo/tamanho, malware scan, quarentena).
 * Este verificador estático corre sempre; em produção acrescenta-se um motor antivírus (ex.: ClamAV)
 * através do mesmo contrato, antes de o ficheiro ficar disponível.
 */

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024

export type DetectedType = 'pdf' | 'docx' | 'doc' | 'odt' | 'jpeg' | 'png'

export const ALLOWED_EXTENSIONS: Record<DetectedType, string> = {
  pdf: '.pdf',
  docx: '.docx',
  doc: '.doc',
  odt: '.odt',
  jpeg: '.jpg',
  png: '.png',
}

export const MIME_BY_TYPE: Record<DetectedType, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  odt: 'application/vnd.oasis.opendocument.text',
  jpeg: 'image/jpeg',
  png: 'image/png',
}

export interface ScanResult {
  status: 'clean' | 'infected' | 'rejected'
  type: DetectedType | null
  detail: string
}

const EICAR = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'

function startsWith(data: Uint8Array, bytes: number[]): boolean {
  return bytes.every((byte, index) => data[index] === byte)
}

function latin1(data: Uint8Array, limit = data.length): string {
  return Buffer.from(data.subarray(0, limit)).toString('latin1')
}

/** Tipo real pelo conteúdo (magic bytes), ignorando a extensão e o MIME declarados. */
export function detectType(data: Uint8Array): DetectedType | null {
  if (startsWith(data, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'pdf'
  if (startsWith(data, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return 'doc'
  if (startsWith(data, [0xff, 0xd8, 0xff])) return 'jpeg'
  if (startsWith(data, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png'
  if (startsWith(data, [0x50, 0x4b, 0x03, 0x04])) {
    const head = latin1(data, Math.min(data.length, 4096))
    if (head.includes('mimetypeapplication/vnd.oasis.opendocument.text')) return 'odt'
    const all = latin1(data)
    if (all.includes('word/document.xml') || all.includes('[Content_Types].xml')) return all.includes('word/') ? 'docx' : null
  }
  return null
}

export function scanUpload(data: Uint8Array): ScanResult {
  if (data.length === 0) return { status: 'rejected', type: null, detail: 'Ficheiro vazio.' }
  if (data.length > MAX_UPLOAD_BYTES) return { status: 'rejected', type: null, detail: 'O ficheiro excede 5 MB.' }
  const text = latin1(data)
  if (text.includes(EICAR)) return { status: 'infected', type: null, detail: 'Assinatura de teste antivírus (EICAR) detectada.' }
  if (startsWith(data, [0x4d, 0x5a]) || startsWith(data, [0x7f, 0x45, 0x4c, 0x46]) || startsWith(data, [0x23, 0x21])) {
    return { status: 'infected', type: null, detail: 'Conteúdo executável não é permitido.' }
  }
  const type = detectType(data)
  if (!type) return { status: 'rejected', type: null, detail: 'Formato não suportado. Use PDF, DOCX, DOC, ODT, JPG ou PNG.' }
  if (type === 'pdf' && /\/(JavaScript|JS|Launch|EmbeddedFile)\b/.test(text)) {
    return { status: 'infected', type, detail: 'PDF com JavaScript, acções automáticas ou ficheiros embebidos foi colocado em quarentena.' }
  }
  if ((type === 'docx' || type === 'odt') && /vbaProject\.bin|Basic\/script-lc\.xml/.test(text)) {
    return { status: 'infected', type, detail: 'Documento com macros foi colocado em quarentena.' }
  }
  return { status: 'clean', type, detail: 'Verificação estática sem ocorrências.' }
}

/** Nome seguro para guardar e mostrar (sem caminhos nem caracteres de controlo). */
export function safeFilename(name: string, type: DetectedType): string {
  const base = name
    .split(/[\\/]/)
    .pop()!
    .replace(/[^\p{L}\p{N}._ -]/gu, '')
    .replace(/\.[^.]*$/, '')
    .trim()
    .slice(0, 80)
  return `${base || 'documento'}${ALLOWED_EXTENSIONS[type]}`
}
