import { existsSync } from 'node:fs'

/** Carrega .env (se existir) sem dependências; variáveis já definidas têm prioridade. */
export function loadEnv(): void {
  if (existsSync('.env')) process.loadEnvFile('.env')
}
