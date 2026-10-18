'use client'

import { useMemo, useState, type KeyboardEvent } from 'react'
import { normalizeText } from '@/lib/text'

const CAPABILITIES = [
  { name: 'Requisição e aprovação', key: 'R', line: 'Nenhuma vaga é publicada sem passar pela matriz de aprovação da empresa, e quem pede nunca aprova.' },
  { name: 'Candidatura pelo telemóvel', key: 'C', line: 'Formulário curto, rascunho guardado no telemóvel e envio que resiste a rede fraca.' },
  { name: 'Importar a folha de Excel', key: 'I', line: 'Valide primeiro, veja cada erro por linha e importe só o que está certo.' },
  { name: 'Duplicados sugeridos', key: 'D', line: 'Mesmo email, telefone ou nome parecido: o sistema sugere, uma pessoa decide.' },
  { name: 'Entrevistas e scorecards', key: 'E', line: 'Convite de calendário para Outlook e Google, critérios iguais para todos e discordâncias à vista.' },
  { name: 'Mensagens com estado', key: 'M', line: 'Cada confirmação, convite ou resposta mostra se foi entregue, está em fila ou falhou e pode ser reenviada.' },
  { name: 'Auditoria imutável', key: 'A', line: 'Quem fez o quê, quando e porquê. Ninguém apaga o registo, nem o administrador.' },
  { name: 'Os dados são seus', key: 'X', line: 'Exportação completa em CSV a qualquer momento e pedidos dos candidatos tratados com prazo.' },
]

/** As capacidades como o menu de comandos do próprio produto: filtrar escrevendo, mover com setas. */
export function CommandList() {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const rows = useMemo(() => {
    const needle = normalizeText(query)
    return CAPABILITIES.filter((item) => !needle || normalizeText(`${item.name} ${item.line}`).includes(needle))
  }, [query])
  const current = Math.min(selected, Math.max(rows.length - 1, 0))

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setSelected((value) => Math.min(value + 1, rows.length - 1))
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setSelected((value) => Math.max(value - 1, 0))
    }
  }

  return (
    <section aria-labelledby="capacidades" className="mx-auto max-w-[1320px] px-5 py-24 sm:px-10 lg:py-40">
      <h2 id="capacidades" className="sr-only">
        Capacidades
      </h2>
      <div data-ui className="text-[var(--ink)]">
        <label className="block lg:w-10/12">
          <span className="sr-only">Procurar uma capacidade</span>
          <input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setSelected(0)
            }}
            onKeyDown={onKeyDown}
            placeholder="Procurar uma capacidade"
            className="h-14 w-full rounded-[10px] bg-[var(--surface)] px-5 text-[20px] font-medium outline-none placeholder:text-[var(--muted)] focus-visible:outline-2 focus-visible:outline-[var(--accent)] lg:h-[1.9em] lg:text-[clamp(28px,3vw,44px)]"
            aria-controls="lista-capacidades"
          />
        </label>
        <ul id="lista-capacidades" role="listbox" aria-label="Capacidades" className="mt-6 space-y-1">
          {rows.map((item, index) => {
            const isSelected = index === current
            return (
              <li
                key={item.name}
                role="option"
                aria-selected={isSelected}
                tabIndex={-1}
                onMouseEnter={() => setSelected(index)}
                onClick={() => setSelected(index)}
                className={`cursor-pointer rounded-[10px] px-4 py-2 transition-colors duration-200 lg:px-5 ${isSelected ? 'bg-[var(--accent)] text-[var(--accent-ink)]' : 'hover:bg-[var(--surface)]'}`}
              >
                <div className="flex items-center justify-between gap-4">
                  <span className="text-[8.5vw] font-semibold leading-[1.1] tracking-[-0.03em] sm:text-[clamp(36px,4.6vw,76px)]">{item.name}</span>
                  <span className="hidden h-[1em] min-w-[1em] place-items-center rounded-[6px] bg-black/10 px-2 text-[clamp(18px,1.6vw,26px)] font-semibold lg:grid" aria-hidden="true">
                    {item.key}
                  </span>
                </div>
                {isSelected ? <p className="pb-2 text-[17px] leading-relaxed">{item.line}</p> : null}
              </li>
            )
          })}
          {rows.length === 0 ? <li className="px-5 py-4 text-[19px] text-[var(--muted)]">Sem resultados para “{query}”.</li> : null}
        </ul>
      </div>
    </section>
  )
}
