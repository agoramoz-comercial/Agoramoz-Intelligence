'use client'

import { useState } from 'react'

/** O primeiro ecrã do produto já aberto: o pedido de piloto segue por email com os valores escolhidos. */
export function PilotDialog({ contactEmail, fallbackUrl }: { contactEmail: string | null; fallbackUrl: string }) {
  const [company, setCompany] = useState('Exemplo Logística, Lda')
  const [volume, setVolume] = useState<'menos de 20' | '20 ou mais'>('20 ou mais')
  const subject = `Piloto AGORAMOZ HR — ${company}`
  const body = `Olá,\n\nGostaríamos de avaliar um piloto do AGORAMOZ HR.\n\nEmpresa: ${company}\nContratações por ano: ${volume}\n\nObrigado.`
  const href = contactEmail ? `mailto:${contactEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}` : fallbackUrl
  return (
    <div data-ui role="dialog" aria-labelledby="pedido-piloto" className="w-full max-w-[440px] rounded-[12px] bg-white p-6 text-[#0b1d2e] shadow-[0_24px_60px_rgba(4,30,26,0.35)]">
      <p id="pedido-piloto" className="text-[20px] font-semibold">
        Pedir um piloto
      </p>
      <label className="mt-5 block">
        <span className="text-[13px] font-semibold text-[#4b5b6a]">Nome da empresa</span>
        <input
          value={company}
          onChange={(event) => setCompany(event.target.value.slice(0, 80))}
          className="mt-1 h-12 w-full rounded-md border border-[#d7dde2] px-3 text-[16px] focus-visible:outline-2 focus-visible:outline-[#0b7a6b]"
        />
      </label>
      <fieldset className="mt-4">
        <legend className="text-[13px] font-semibold text-[#4b5b6a]">Contratações por ano</legend>
        <div className="mt-1 grid grid-cols-2 gap-1 rounded-md bg-[#e7ecea] p-1">
          {(['menos de 20', '20 ou mais'] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={volume === option}
              onClick={() => setVolume(option)}
              className={`h-10 rounded-[5px] text-[15px] font-semibold transition-colors ${volume === option ? 'bg-white text-[#0b1d2e]' : 'text-[#4b5b6a] hover:text-[#0b1d2e]'}`}
            >
              {option}
            </button>
          ))}
        </div>
      </fieldset>
      <a href={href} className="mt-6 flex h-[52px] w-full items-center justify-center rounded-md bg-[#0b7a6b] text-[16px] font-semibold text-white transition-transform hover:bg-[#08645a] active:scale-[0.98]">
        Pedir piloto
      </a>
      <p className="mt-3 text-[13px] text-[#4b5b6a]">{contactEmail ? 'Abre o seu email com o pedido já escrito.' : 'Abre o contacto da AGORAMOZ.'}</p>
    </div>
  )
}
