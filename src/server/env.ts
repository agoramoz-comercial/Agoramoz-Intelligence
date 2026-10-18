import { z } from 'zod'

const booleanFlag = z
  .enum(['true', 'false', '1', '0', ''])
  .optional()
  .transform((value) => value === 'true' || value === '1')

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().url(),
  DATABASE_ADMIN_URL: z.string().url().optional(),
  APP_URL: z.string().url().default('http://localhost:3000'),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET deve ter pelo menos 32 caracteres'),
  STORAGE_DIR: z.string().default('./storage'),
  EMAIL_PROVIDER: z.enum(['log', 'smtp']).default('log'),
  SMTP_URL: z.string().optional(),
  EMAIL_FROM: z.string().default('AGORAMOZ HR <no-reply@example.org>'),
  AI_ENABLED: booleanFlag,
  ANTHROPIC_API_KEY: z.string().optional(),
  AI_MODEL: z.string().default('claude-opus-5-5'),
  CONTACT_EMAIL: z.string().email().optional().or(z.literal('').transform(() => undefined)),
})

export type Env = z.infer<typeof envSchema>

let cached: Env | undefined

/** Variáveis de ambiente validadas no primeiro acesso; falha cedo com mensagem clara. */
export function env(): Env {
  if (cached) return cached
  const parsed = envSchema.safeParse(process.env)
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')
    throw new Error(`Configuração inválida: ${issues}`)
  }
  if (parsed.data.NODE_ENV === 'production' && parsed.data.SESSION_SECRET.startsWith('change-me')) {
    throw new Error('SESSION_SECRET de exemplo não pode ser usado em produção')
  }
  cached = parsed.data
  return cached
}

export function aiConfigured(): boolean {
  const config = env()
  return config.AI_ENABLED && Boolean(config.ANTHROPIC_API_KEY)
}
