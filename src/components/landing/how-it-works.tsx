'use client'

import { useEffect, useRef, useState } from 'react'

const STEPS = [
  {
    title: 'Receba de qualquer canal.',
    line: 'Formulário móvel, email, WhatsApp ou a folha de Excel antiga: tudo entra no mesmo pipeline, com a origem registada.',
  },
  {
    title: 'Avalie todos pelos mesmos critérios.',
    line: 'Requisitos aprovados antes de publicar, evidência citada do CV e um scorecard por competência para cada entrevistador.',
  },
  {
    title: 'Decida e responda a cada pessoa.',
    line: 'A decisão fica fundamentada no registo e o candidato recebe resposta, qualquer que seja o resultado.',
  },
]

function Inbox() {
  const rows = [
    ['Joana Macuácua', 'Formulário móvel', 'Evidência 3/3'],
    ['+258 84 555 0123', 'WhatsApp, registado pelo RH', 'Pedir CV'],
    ['cv_ernesto_langa.pdf', 'Email', 'Evidência 2/3'],
    ['candidatos_obra.xlsx', 'Importação: 12 linhas válidas', '1 duplicado sugerido'],
  ]
  return (
    <div className="space-y-2">
      <p className="text-[14px] font-semibold">Novas · Fiel de Armazém</p>
      {rows.map(([name, source, tag]) => (
        <div key={name} className="flex items-center justify-between gap-3 rounded-md border border-[#e3e7eb] bg-white px-3 py-2.5">
          <div>
            <p className="text-[14px] font-semibold">{name}</p>
            <p className="text-[13px] text-[#4b5b6a]">{source}</p>
          </div>
          <span className="whitespace-nowrap rounded-full bg-[#f3f5f4] px-2 py-0.5 text-[12px] font-semibold">{tag}</span>
        </div>
      ))}
    </div>
  )
}

function Scorecard() {
  const rows = [
    ['Rigor no controlo de stocks', 4, 3, 'Descreveu inventário mensal com reconciliação.'],
    ['Segurança no trabalho', 3, 1, 'Discordância: discutir antes de decidir.'],
    ['Comunicação', 3, 4, 'Exemplo de coordenação com motoristas.'],
  ] as const
  return (
    <div className="space-y-2.5">
      <p className="text-[14px] font-semibold">Consolidação · 2 scorecards submetidos</p>
      {rows.map(([name, a, b, note]) => (
        <div key={name} className={`rounded-md border px-3 py-2.5 ${Math.abs(a - b) >= 2 ? 'border-[#e8c98f] bg-[#fdf6e9]' : 'border-[#e3e7eb] bg-white'}`}>
          <div className="flex items-center justify-between gap-2">
            <p className="text-[14px] font-semibold">{name}</p>
            <p className="text-[13px] font-semibold tabular-nums">
              {a} · {b}
            </p>
          </div>
          <p className="text-[13px] text-[#4b5b6a]">{note}</p>
        </div>
      ))}
    </div>
  )
}

function Decision() {
  return (
    <div className="space-y-2.5">
      <p className="text-[14px] font-semibold">Decisão · Fiel de Armazém</p>
      <div className="rounded-md border border-[#bfe3cb] bg-[#eef8f1] px-3 py-2.5">
        <p className="text-[14px] font-semibold text-[#12703a]">Joana Macuácua · Contratada</p>
        <p className="text-[13px] text-[#4b5b6a]">Fundamento registado por Carlos Muianga, RH</p>
      </div>
      {[
        ['Respostas finais', '13 de 13 candidatos'],
        ['Convite de calendário', 'enviado com .ics'],
        ['Registo de auditoria', '47 eventos, nenhum editável'],
      ].map(([label, value]) => (
        <div key={label} className="flex items-center justify-between rounded-md border border-[#e3e7eb] bg-white px-3 py-2.5 text-[14px]">
          <span>{label}</span>
          <span className="font-semibold">{value}</span>
        </div>
      ))}
    </div>
  )
}

/** Um fragmento fixo que muda de estado conforme a frase activa (classe, não capturas de ecrã). */
export function HowItWorks() {
  const [active, setActive] = useState(0)
  const refs = useRef<(HTMLDivElement | null)[]>([])
  useEffect(() => {
    if (!('IntersectionObserver' in window)) return
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) if (entry.isIntersecting) setActive(Number((entry.target as HTMLElement).dataset.step))
      },
      { rootMargin: '-45% 0px -45% 0px', threshold: 0 },
    )
    refs.current.forEach((element) => element && observer.observe(element))
    return () => observer.disconnect()
  }, [])
  const states = [<Inbox key="inbox" />, <Scorecard key="score" />, <Decision key="decision" />]
  return (
    <section aria-labelledby="como-funciona" className="mx-auto grid max-w-[1320px] grid-cols-1 gap-x-10 px-5 py-24 sm:px-10 lg:grid-cols-12 lg:py-40">
      <div className="lg:col-span-5">
        <h2 id="como-funciona" className="text-[32px] font-semibold tracking-[-0.02em]">
          Três passos, um registo
        </h2>
        {STEPS.map((step, index) => (
          <div
            key={step.title}
            ref={(element) => {
              refs.current[index] = element
            }}
            data-step={index}
            className="flex min-h-[60svh] flex-col justify-center lg:min-h-[80vh]"
          >
            <p className={`text-[24px] font-semibold leading-[1.15] tracking-[-0.02em] transition-colors duration-300 lg:text-[32px] ${active === index ? 'text-[var(--ink)]' : 'text-[var(--muted)]'}`}>
              {step.title}
            </p>
            <p className="mt-3 max-w-[44ch] text-[17px] leading-relaxed">{step.line}</p>
          </div>
        ))}
      </div>
      <div className="order-first lg:order-none lg:col-span-7">
        <div className="sticky top-0 z-10 flex h-[46svh] items-start justify-center overflow-hidden bg-[var(--bg)] pt-3 lg:top-[14vh] lg:h-auto lg:overflow-visible lg:bg-transparent lg:pt-0">
          <div className="w-full max-w-[520px] rounded-[14px] bg-[#e1ebe7] p-6 lg:p-10">
            <div data-ui className="min-h-[300px] rounded-[10px] bg-[#f7f9f8] p-4 text-[#0b1d2e] lg:min-h-[340px]">
              {states.map((state, index) => (
                <div key={index} hidden={active !== index} className="animate-[rise_500ms_var(--ease-out)]">
                  {state}
                </div>
              ))}
            </div>
            <p className="sr-only" aria-live="polite">
              {STEPS[active]?.title}
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
