'use client'

import { useState } from 'react'

function Row({ state, onSchedule }: { state: 'arrives' | 'review' | 'done'; onSchedule?: () => void }) {
  return (
    <div data-ui className="w-full max-w-[640px] rounded-[10px] border border-[#e3e7eb] bg-white p-4 text-[#0b1d2e]">
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-[#dce7f8] text-[14px] font-semibold text-[#1f4fa8]">EL</span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold">Ernesto Langa</p>
          <p className="text-[13px] text-[#4b5b6a]">Fiel de Armazém · chegou por WhatsApp · há 2 h</p>
        </div>
        <span className="rounded-full bg-[#f7e8cc] px-2 py-0.5 text-[12px] font-semibold text-[#8a5300]">Evidência 2/3</span>
      </div>
      {state === 'review' ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="rounded-md bg-[#0b7a6b] px-3 py-2 text-[14px] font-semibold text-white transition-transform hover:bg-[#08645a] active:scale-[0.97]" onClick={onSchedule}>
            Agendar entrevista
          </button>
          <button type="button" className="rounded-md bg-[#e7ecea] px-3 py-2 text-[14px] font-semibold transition-transform active:scale-[0.97]">
            Pedir certificado de empilhadores
          </button>
        </div>
      ) : null}
      {state === 'done' ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-md bg-[#eef8f1] px-3 py-2 text-[14px]">
          <span className="font-semibold text-[#12703a]">Entrevista: quarta, 10:00 · Matola</span>
          <span className="text-[13px] text-[#4b5b6a]">Convite .ics entregue ao candidato</span>
        </div>
      ) : null}
    </div>
  )
}

/** A linha central do produto em três estados; a do meio funciona e passa ao terceiro. */
export function Showcase() {
  const [scheduled, setScheduled] = useState(false)
  const states: { word: string; state: 'arrives' | 'review' | 'done' }[] = [
    { word: 'Chega', state: 'arrives' },
    { word: scheduled ? 'Agendada' : 'Em análise', state: scheduled ? 'done' : 'review' },
    { word: 'Respondida', state: 'done' },
  ]
  return (
    <section aria-labelledby="uma-candidatura" className="mx-auto max-w-[1320px] px-5 py-24 sm:px-10 lg:py-40">
      <div className="lg:grid lg:grid-cols-12 lg:gap-x-10">
        <h2 id="uma-candidatura" className="mb-12 text-[32px] font-semibold tracking-[-0.02em] lg:col-span-9 lg:col-start-4 lg:mb-24" data-reveal>
          Uma candidatura, três momentos
        </h2>
      </div>
      <ol className="space-y-12 lg:space-y-14">
        {states.map((item, index) => (
          <li key={index} className="flex flex-col gap-2 lg:grid lg:grid-cols-12 lg:items-center lg:gap-x-10" data-reveal style={{ ['--i' as string]: index }}>
            <span className="order-2 text-[17px] text-[var(--muted)] lg:order-none lg:col-span-3 lg:text-right lg:text-[20px]">{item.word}</span>
            <div className="lg:col-span-6">
              <Row state={item.state} onSchedule={index === 1 ? () => setScheduled(true) : undefined} />
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}
