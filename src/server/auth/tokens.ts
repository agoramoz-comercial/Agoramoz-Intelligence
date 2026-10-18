import { createHmac, randomBytes } from 'node:crypto'
import { env } from '../env'

/** Token opaco aleatório (256 bits), seguro para URL e cookie. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}

/** HMAC do token: uma fuga da base de dados não permite forjar sessões ou ligações. */
export function hashToken(token: string): string {
  return createHmac('sha256', env().SESSION_SECRET).update(token).digest('hex')
}

const REFERENCE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'

/** Referência legível para o candidato (sem 0/O/1/I), ex.: AGH-7K3P9Q. */
export function candidateReference(): string {
  const bytes = randomBytes(6)
  const chars = Array.from(bytes, (byte) => REFERENCE_ALPHABET[byte % REFERENCE_ALPHABET.length])
  return `AGH-${chars.join('')}`
}
