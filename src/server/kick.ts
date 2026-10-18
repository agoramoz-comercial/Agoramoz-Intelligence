import { after } from 'next/server'
import { processOutbox } from '@/modules/communications/service'

/** Entrega imediata das mensagens geradas por um pedido, depois de enviada a resposta (o worker é a rede de segurança). */
export function kickOutbox(): void {
  after(async () => {
    try {
      await processOutbox(20)
    } catch (error: unknown) {
      console.error('[outbox] entrega imediata falhou; o worker tentará de novo', error)
    }
  })
}
