import type { Metadata } from 'next'
import Link from 'next/link'
import { EvidenceFragment } from '@/components/landing/evidence-fragment'
import { HowItWorks } from '@/components/landing/how-it-works'
import { Showcase } from '@/components/landing/showcase'
import { CommandList } from '@/components/landing/command-list'
import { PilotDialog } from '@/components/landing/pilot-dialog'

export const metadata: Metadata = {
  title: 'AGORAMOZ HR — recrutamento com evidência',
  description: 'Candidaturas do formulário, email, WhatsApp e Excel num único processo auditado, com decisões fundamentadas e resposta a cada candidato.',
}

const FAQ = [
  {
    q: 'Temos de deixar de usar o WhatsApp e o email?',
    a: 'Não. Os canais continuam. O que muda é que cada candidatura entra no mesmo processo, com a origem registada: pelo formulário, por registo do RH ou pela importação da folha.',
  },
  {
    q: 'A inteligência artificial decide quem é contratado?',
    a: 'Não. A verificação de evidência mostra onde está cada requisito no CV e a IA opcional resume com citações verificadas. Nenhuma das duas pontua, rejeita ou decide: a decisão é de pessoas e fica fundamentada.',
  },
  {
    q: 'Os nossos dados ficam presos na plataforma?',
    a: 'Não. O administrador exporta tudo em CSV a qualquer momento: candidatos, vagas, decisões, scorecards, mensagens e auditoria.',
  },
  {
    q: 'Funciona em telemóveis com rede fraca?',
    a: 'Foi desenhado para isso. O formulário guarda o rascunho no telemóvel, mostra o progresso do envio do CV e, se a rede cair, deixa reenviar sem voltar a escrever.',
  },
  {
    q: 'Como fica a privacidade dos candidatos?',
    a: 'Consentimento separado para o processo, talent pool e WhatsApp; prazos de conservação; pedidos de acesso e eliminação confirmados por email. O enquadramento legal é validado com assessoria jurídica em Moçambique antes de cada piloto.',
    id: 'privacidade',
  },
  {
    q: 'Integra com o Outlook?',
    a: 'Os convites seguem em formato de calendário (.ics), que o Outlook e o Google Calendar aceitam. A sincronização directa com o Microsoft Graph entra depois da prova técnica com os pilotos.',
  },
  {
    q: 'Quanto tempo até começar?',
    a: 'A implementação é assistida: departamentos, matriz de aprovação, modelos de mensagem e importação da folha actual. A meta do piloto é a primeira vaga activa em até dez dias.',
  },
  {
    q: 'Como é o preço?',
    a: 'Subscrição por organização com implementação assistida. A proposta é feita depois do diagnóstico, com os custos de mensagens e IA separados e transparentes.',
  },
]

export default function LandingPage() {
  // Lido no build (página estática): mudar o contacto exige novo deploy.
  const contactEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(process.env.CONTACT_EMAIL ?? '') ? process.env.CONTACT_EMAIL! : null
  return (
    <div className="bg-[var(--bg)] text-[var(--ink)]">
      {/* Herói: duas metades por tom; o fragmento do produto funciona e lê o texto do visitante. */}
      <section className="grid min-h-svh grid-cols-1 lg:grid-cols-2">
        <div className="relative flex flex-col justify-end bg-[var(--navy)] px-5 pb-10 pt-20 text-[var(--navy-ink)] sm:px-10 lg:min-h-svh lg:pb-10 lg:pt-10">
          <p className="absolute left-5 top-6 text-[17px] font-semibold tracking-tight sm:left-10 sm:top-10">AGORAMOZ HR</p>
          <Link href="/entrar" className="absolute right-5 top-6 text-[14px] text-[var(--navy-ink)] underline-offset-4 hover:underline lg:hidden">
            Entrar
          </Link>
          <h1 className="lines text-[6.4vw] font-medium leading-[1.05] tracking-[-0.02em] sm:text-[32px]">
            <span className="line">
              <span data-line style={{ ['--i' as string]: 0 }}>
                Contratar com evidência.
              </span>
            </span>
          </h1>
          <p className="mt-4 max-w-[44ch] text-[17px] leading-relaxed text-[var(--navy-muted)]" data-rise style={{ ['--i' as string]: 3 }}>
            A gateway de recrutamento que junta candidaturas do formulário, email, WhatsApp e Excel num único processo auditado, para empresas em Moçambique.
          </p>
          <div className="mt-7" data-rise style={{ ['--i' as string]: 4 }}>
            <a href="#piloto" className="inline-flex h-12 items-center bg-[var(--navy-ink)] px-6 text-[17px] font-semibold text-[var(--navy)] transition-transform hover:bg-white active:scale-[0.97]">
              Pedir um piloto
            </a>
          </div>
        </div>
        <div className="relative flex items-center justify-center bg-[var(--navy-2)] px-4 py-12 sm:px-[6vw] lg:min-h-svh lg:py-16">
          <Link href="/entrar" className="absolute right-10 top-10 hidden text-[14px] text-[var(--navy-ink)] underline-offset-4 hover:underline lg:block">
            Entrar
          </Link>
          <div data-rise style={{ ['--i' as string]: 2 }} className="flex w-full justify-center">
            <EvidenceFragment />
          </div>
        </div>
      </section>

      {/* Intro: coluna estreita, o problema em frases curtas. */}
      <section className="px-5 pb-40 pt-16 sm:px-10 lg:pl-[15vw]">
        <div className="max-w-[78%] space-y-5 text-[17px] leading-[1.55] sm:max-w-[340px]">
          <p className="font-medium" data-reveal>
            Em muitas empresas, uma vaga vive em cinco sítios ao mesmo tempo: o email do RH, o WhatsApp do gestor, um anúncio, uma folha de Excel e a memória de quem entrevistou.
          </p>
          <p data-reveal style={{ ['--i' as string]: 1 }}>
            Quando chega a hora de decidir, ninguém sabe ao certo quantos se candidataram, quem falou com quem, ou porque um candidato avançou e outro não.
          </p>
          <p data-reveal style={{ ['--i' as string]: 2 }}>
            E muitos candidatos nunca recebem resposta.
          </p>
          <p data-reveal style={{ ['--i' as string]: 3 }}>
            O AGORAMOZ HR não pede que abandone esses canais. Liga-os a um único processo, com responsável, estado e prova em cada passo.{' '}
            <Link className="link text-[var(--ink)] underline decoration-[var(--line)]" href="/carreiras/demo-construcoes">
              Ver uma página de carreiras de demonstração
            </Link>
            .
          </p>
        </div>
      </section>

      <HowItWorks />
      <Showcase />
      <CommandList />

      {/* FAQ: título fixo à esquerda, mosaico de respostas à direita. */}
      <section aria-labelledby="perguntas" className="mx-auto max-w-[1320px] px-5 py-24 sm:px-10 lg:grid lg:grid-cols-12 lg:gap-x-10 lg:py-40">
        <h2 id="perguntas" className="mb-8 text-[9vw] font-semibold leading-[1] tracking-[-0.03em] lg:sticky lg:top-24 lg:col-span-4 lg:mb-0 lg:self-start lg:text-[4vw]">
          Perguntas directas
        </h2>
        <div className="space-y-1.5 lg:col-span-8 lg:space-y-2">
          {FAQ.map((item, index) => (
            <details
              key={item.q}
              id={item.id}
              name="faq"
              className="group rounded-[10px] bg-[var(--surface)] transition-colors open:bg-[var(--accent)] open:text-[var(--accent-ink)]"
              data-reveal
              style={{ ['--i' as string]: index % 4 }}
            >
              <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 p-6 text-[18px] font-medium lg:min-h-[72px] lg:text-[20px]">
                {item.q}
                <span className="relative h-4 w-4 shrink-0" aria-hidden="true">
                  <span className="absolute left-0 top-[6.5px] h-[3px] w-4 rounded bg-current" />
                  <span className="absolute left-[6.5px] top-0 h-4 w-[3px] rounded bg-current transition-transform duration-300 group-open:rotate-90 group-open:opacity-0" />
                </span>
              </summary>
              <p className="max-w-[52ch] px-6 pb-6 text-[16px] leading-relaxed lg:text-[17px]">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* CTA: o primeiro passo do produto já aberto, num campo de cor do acento. */}
      <section id="piloto" className="grid min-h-[90svh] grid-cols-1 gap-10 bg-[var(--accent)] px-5 py-16 text-[var(--accent-ink)] sm:px-10 lg:grid-cols-12 lg:py-10">
        <div className="flex flex-col justify-start lg:col-span-6 lg:justify-end">
          <h2 className="text-[13vw] font-semibold leading-[0.92] tracking-[-0.035em] sm:text-[clamp(56px,6.2vw,100px)]" data-reveal>
            Comece por
            <br />
            uma vaga.
          </h2>
          <p className="mt-5 max-w-[42ch] text-[17px] leading-relaxed" data-reveal style={{ ['--i' as string]: 1 }}>
            Respondemos com um convite para diagnóstico e uma proposta de piloto pago, com critérios de sucesso definidos à partida.
          </p>
        </div>
        <div className="flex items-end justify-center lg:col-span-5 lg:col-start-8 lg:items-center" data-reveal style={{ ['--i' as string]: 2 }}>
          <PilotDialog contactEmail={contactEmail} fallbackUrl="https://agoramoz.com/mz" />
        </div>
      </section>

      <footer className="grid grid-cols-1 gap-2 px-5 pb-6 pt-[20svh] text-[14px] sm:px-10 lg:grid-cols-[1fr_auto_1fr] lg:pt-[30svh]">
        <span className="text-[var(--muted)]">AGORAMOZ HR, gateway de recrutamento</span>
        <nav aria-label="Rodapé" className="flex flex-wrap gap-6">
          <Link className="link text-[var(--ink)]" href="/carreiras/demo-construcoes">
            Demonstração
          </Link>
          <Link className="link text-[var(--ink)]" href="/entrar">
            Entrar
          </Link>
          <a className="link text-[var(--ink)]" href="https://agoramoz.com/" rel="noreferrer">
            agoramoz.com
          </a>
        </nav>
        <span className="text-[var(--muted)] lg:text-right">
          2026 ·{' '}
          <a className="link text-[var(--ink)]" href="#privacidade">
            Privacidade
          </a>
        </span>
      </footer>
    </div>
  )
}
