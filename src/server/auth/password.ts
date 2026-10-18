import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>

const KEY_LENGTH = 32
const BLOCK_SIZE = 8
const PARALLELISM = 1
/** OWASP: scrypt N=2^17, r=8, p=1. Testes podem baixar o custo com PASSWORD_HASH_COST. */
const DEFAULT_COST_LOG2 = 17
export const MIN_PASSWORD_LENGTH = 12

function costLog2(): number {
  const fromEnv = Number(process.env.PASSWORD_HASH_COST)
  return Number.isInteger(fromEnv) && fromEnv >= 12 && fromEnv <= 20 ? fromEnv : DEFAULT_COST_LOG2
}

function maxmemFor(n: number, r: number): number {
  return 128 * n * r * 2
}

export async function hashPassword(password: string): Promise<string> {
  const n = 2 ** costLog2()
  const salt = randomBytes(16)
  const key = await scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, { N: n, r: BLOCK_SIZE, p: PARALLELISM, maxmem: maxmemFor(n, BLOCK_SIZE) })
  return ['scrypt', n, BLOCK_SIZE, PARALLELISM, salt.toString('base64url'), key.toString('base64url')].join('$')
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false
  const [, nRaw, rRaw, pRaw, saltRaw, keyRaw] = parts as [string, string, string, string, string, string]
  const n = Number(nRaw)
  const r = Number(rRaw)
  const p = Number(pRaw)
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) return false
  const expected = Buffer.from(keyRaw, 'base64url')
  const actual = await scrypt(password.normalize('NFKC'), Buffer.from(saltRaw, 'base64url'), expected.length, { N: n, r, p, maxmem: maxmemFor(n, r) })
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

/** Hash fictício para igualar o tempo de resposta quando o utilizador não existe. */
let dummyHash: Promise<string> | undefined
export function dummyPasswordHash(): Promise<string> {
  dummyHash ??= hashPassword(randomBytes(16).toString('hex'))
  return dummyHash
}

export function passwordPolicyError(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `A palavra-passe deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`
  if (password.length > 200) return 'A palavra-passe é demasiado longa.'
  return null
}
