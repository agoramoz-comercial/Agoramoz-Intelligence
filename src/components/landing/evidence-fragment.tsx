'use client'

import { useMemo, useState } from 'react'
import { analyzeEvidence } from '@/modules/evidence/engine'
import type { Requirement } from '@/modules/requisitions/schema'

const REQUIREMENTS: Requirement[] = [
  { id: 'r1', text: 'Experiência em armazém ou gestão de stocks', kind: 'must' },
  { id: 'r2', text: 'Carta de condução profissional', kind: 'must' },
  { id: 'r3', text: 'Ensino médio concluído', kind: 'must' },
]

const SAMPLE = `Fiel de armazém, Distribuidora do Sul, Matola (2021-2024)
Inventários mensais e controlo de entradas e saídas
Ensino médio concluído na Escola Secundária da Matola`

/**
 * O produto a trabalhar no primeiro ecrã: o motor de evidência real (o mesmo do servidor) lê o excerto
 * de CV que o visitante escreve e diz, com citação, que requisitos têm prova. Sem pontuação.
 */
export function EvidenceFragment() {
  const [text, setText] = useState(SAMPLE)
  const report = useMemo(() => analyzeEvidence({ requirements: REQUIREMENTS, cvText: text }), [text])
  return (
    <div data-ui className="w-full max-w-[460px] rounded-[10px] bg-white text-[#0b1d2e]">
      <div className="flex items-center justify-between rounded-t-[10px] bg-[#eef2f0] px-4 py-3">
        <p className="text-[14px] font-semibold">Fiel de Armazém · verificação de evidência</p>
        <span className="shrink-0 whitespace-nowrap rounded-full bg-[#dce7f8] px-2 py-0.5 text-[12px] font-semibold text-[#1f4fa8]">ao vivo</span>
      </div>
      <div className="space-y-3 p-4">
        <label className="block">
          <span className="text-[13px] font-semibold text-[#4b5b6a]">Excerto do CV (pode editar)</span>
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={5}
            spellCheck={false}
            className="mt-1 min-h-[112px] w-full resize-none rounded-md border border-[#d7dde2] bg-[#f7f9f8] p-2.5 text-[14px] leading-snug focus-visible:outline-2 focus-visible:outline-[#0b7a6b]"
          />
        </label>
        <ul className="space-y-2" aria-live="polite">
          {report.requirements.map((item) => (
            <li key={item.requirementId} className="grid grid-cols-[auto_1fr] items-start gap-2.5 text-[14px]">
              <span
                className={`mt-0.5 rounded-full px-2 py-0.5 text-[12px] font-semibold ${item.found ? 'bg-[#dcf1e3] text-[#12703a]' : 'bg-[#f8dedb] text-[#b3261e]'}`}
              >
                {item.found ? 'Com prova' : 'Sem prova'}
              </span>
              <span>
                {item.text}
                {item.snippet ? <span className="mt-0.5 block text-[13px] text-[#4b5b6a]">“{item.snippet}”</span> : null}
              </span>
            </li>
          ))}
        </ul>
        <p className="rounded-md bg-[#f3f5f4] p-2.5 text-[13px] font-medium leading-snug">{report.statement}</p>
      </div>
    </div>
  )
}
