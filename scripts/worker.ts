/**
 * Worker da outbox: entrega mensagens em fila (todos os tenants), com retries e dead-letter.
 * Em produção corre como processo separado (ou job agendado); o servidor web também dispara
 * uma entrega imediata após cada pedido que gera mensagens.
 */
import { loadEnv } from './load-env'

loadEnv()

const INTERVAL_MS = Number(process.env.WORKER_INTERVAL_MS ?? 10_000)

async function main(): Promise<void> {
  const { processOutbox } = await import('@/modules/communications/service')
  const { closeDb } = await import('@/server/db/client')
  let running = true
  const stop = () => {
    running = false
  }
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
  console.log(`Worker da outbox activo (intervalo ${INTERVAL_MS} ms)`)
  while (running) {
    try {
      const result = await processOutbox(50)
      if (result.sent + result.failed + result.dead > 0) console.log(new Date().toISOString(), JSON.stringify(result))
    } catch (error: unknown) {
      console.error('Falha no ciclo da outbox', error)
    }
    await new Promise((resolve) => setTimeout(resolve, INTERVAL_MS))
  }
  await closeDb()
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
