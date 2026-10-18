import { env } from '../env'

export interface OutgoingAttachment {
  filename: string
  contentType: string
  /** Conteúdo em base64. */
  content: string
}

export interface OutgoingEmail {
  to: string
  subject: string
  text: string
  attachments: OutgoingAttachment[]
  messageId: string
}

export interface MailProvider {
  readonly name: string
  send(email: OutgoingEmail): Promise<{ providerMessageId: string }>
}

/** Desenvolvimento e pilotos sem SMTP: a mensagem fica registada (visível em Mensagens) e não sai do sistema. */
class LogProvider implements MailProvider {
  readonly name = 'log'
  async send(email: OutgoingEmail): Promise<{ providerMessageId: string }> {
    if (email.to.endsWith('.invalid')) throw new Error('Endereço de destino rejeitado (domínio .invalid)')
    return { providerMessageId: `log:${email.messageId}` }
  }
}

class SmtpProvider implements MailProvider {
  readonly name = 'smtp'
  private transport: import('nodemailer').Transporter | undefined

  async send(email: OutgoingEmail): Promise<{ providerMessageId: string }> {
    const url = env().SMTP_URL
    if (!url) throw new Error('SMTP_URL não configurado')
    if (!this.transport) {
      const nodemailer = await import('nodemailer')
      this.transport = nodemailer.createTransport(url)
    }
    const info = await this.transport.sendMail({
      from: env().EMAIL_FROM,
      to: email.to,
      subject: email.subject,
      text: email.text,
      messageId: `<${email.messageId}@agoramoz-hr>`,
      attachments: email.attachments.map((attachment) => ({
        filename: attachment.filename,
        contentType: attachment.contentType,
        content: Buffer.from(attachment.content, 'base64'),
      })),
    })
    return { providerMessageId: String(info.messageId) }
  }
}

let provider: MailProvider | undefined
export function mailProvider(): MailProvider {
  provider ??= env().EMAIL_PROVIDER === 'smtp' ? new SmtpProvider() : new LogProvider()
  return provider
}

export function setMailProviderForTests(custom: MailProvider | undefined): void {
  provider = custom
}
