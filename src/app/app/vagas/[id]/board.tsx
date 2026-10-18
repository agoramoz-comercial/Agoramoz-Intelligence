'use client'

import Link from 'next/link'
import { useState, useTransition, type DragEvent } from 'react'
import type { BoardCard } from '@/modules/applications/pipeline'
import type { StageRow } from '@/modules/vacancies/service'
import type { ActionResult } from '@/server/actions'

interface BoardProps {
  stages: (StageRow & { cards: BoardCard[] })[]
  stalledDays: number
  canMove: boolean
  sourceLabels: Record<string, string>
  moveAction: (applicationId: string, stageId: string) => Promise<ActionResult<null>>
}

function formatShort(value: Date | string): string {
  return new Intl.DateTimeFormat('pt-MZ', { timeZone: 'Africa/Maputo', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

/** Pipeline da vaga: arrastar entre etapas (rato/toque) ou menu "Mover para" (teclado). */
export function PipelineBoard({ stages, stalledDays, canMove, sourceLabels, moveAction }: BoardProps) {
  const [placement, setPlacement] = useState<Record<string, string>>({})
  const [dragging, setDragging] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const allCards = stages.flatMap((stage) => stage.cards)
  const stageOf = (card: BoardCard) => placement[card.id] ?? card.stageId
  const hiredStage = stages.find((stage) => stage.kind === 'hired')

  function move(cardId: string, stageId: string) {
    const card = allCards.find((item) => item.id === cardId)
    if (!card || stageOf(card) === stageId) return
    if (stageId === hiredStage?.id) {
      setError('Para contratar, abra o dossier do candidato e use "Contratar": a decisão fica fundamentada e comunicada.')
      return
    }
    const previous = stageOf(card)
    setError(null)
    setPlacement((current) => ({ ...current, [cardId]: stageId }))
    startTransition(async () => {
      const result = await moveAction(cardId, stageId)
      if (!result.ok) {
        setPlacement((current) => ({ ...current, [cardId]: previous ?? '' }))
        setError(result.error)
      }
    })
  }

  function onDrop(event: DragEvent<HTMLElement>, stageId: string) {
    event.preventDefault()
    const cardId = event.dataTransfer.getData('text/plain')
    setOver(null)
    setDragging(null)
    if (cardId) move(cardId, stageId)
  }

  return (
    <div>
      {error ? (
        <p role="alert" className="mb-3 rounded-md bg-[var(--warn-bg)] px-3 py-2 text-sm font-medium text-[var(--warn)]">
          {error}
        </p>
      ) : null}
      <p className="sr-only" aria-live="polite">
        {pending ? 'A mover candidatura…' : ''}
      </p>
      <div className="flex gap-3 overflow-x-auto pb-3" role="list" aria-label="Etapas do pipeline">
        {stages.map((stage) => {
          const cards = allCards.filter((card) => stageOf(card) === stage.id)
          return (
            <section
              key={stage.id}
              role="listitem"
              aria-label={`${stage.name}: ${cards.length} candidatura(s)`}
              onDragOver={(event) => {
                if (!canMove) return
                event.preventDefault()
                setOver(stage.id)
              }}
              onDragLeave={() => setOver((current) => (current === stage.id ? null : current))}
              onDrop={(event) => onDrop(event, stage.id)}
              className={`flex w-[264px] shrink-0 flex-col rounded-xl p-2 transition-colors ${over === stage.id ? 'bg-[#d4e8e3]' : 'bg-[var(--surface)]'}`}
            >
              <header className="flex items-center justify-between px-2 py-1.5">
                <h3 className="text-[14px] font-semibold">{stage.name}</h3>
                <span className="nums text-[13px] font-semibold text-[var(--muted)]">{cards.length}</span>
              </header>
              <ul className="flex min-h-24 flex-col gap-2">
                {cards.map((card) => {
                  const stalled = card.daysInStage >= stalledDays && card.status === 'active'
                  const flags = card.evidence?.answerFlags?.length ?? 0
                  return (
                    <li
                      key={card.id}
                      draggable={canMove && card.status === 'active'}
                      onDragStart={(event) => {
                        event.dataTransfer.setData('text/plain', card.id)
                        event.dataTransfer.effectAllowed = 'move'
                        setDragging(card.id)
                      }}
                      onDragEnd={() => setDragging(null)}
                      className={`rounded-lg bg-[var(--panel)] p-3 transition-transform ${dragging === card.id ? 'scale-[0.98] opacity-60' : ''} ${canMove && card.status === 'active' ? 'cursor-grab active:cursor-grabbing' : ''}`}
                    >
                      <Link href={`/app/candidaturas/${card.id}`} className="block font-semibold leading-snug hover:underline">
                        {card.candidateName}
                      </Link>
                      <p className="mt-0.5 text-[12.5px] text-[var(--muted)]">
                        {sourceLabels[card.source] ?? card.source} · {card.reference}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {card.evidence ? (
                          card.evidence.hasText ? (
                            <span className={`badge ${card.evidence.mustFound === card.evidence.mustTotal ? 'badge-ok' : 'badge-warn'}`} title="Requisitos obrigatórios com evidência textual no CV (requer validação humana)">
                              Evidência {card.evidence.mustFound}/{card.evidence.mustTotal}
                            </span>
                          ) : (
                            <span className="badge" title="CV sem texto extraível ou sem CV">
                              Ler CV
                            </span>
                          )
                        ) : null}
                        {flags > 0 ? <span className="badge badge-warn">Elegibilidade a confirmar</span> : null}
                        {card.hasDuplicate ? <span className="badge badge-info">Possível duplicado</span> : null}
                        {stalled ? <span className="badge badge-danger">Parada há {card.daysInStage} dias</span> : null}
                        {card.pendingScorecards > 0 ? <span className="badge badge-warn">{card.pendingScorecards} scorecard(s) em falta</span> : null}
                        {card.status === 'hired' ? <span className="badge badge-ok">Contratado</span> : null}
                      </div>
                      {card.nextInterviewAt ? <p className="mt-2 text-[12.5px]">Entrevista: {formatShort(card.nextInterviewAt)}</p> : null}
                      {card.tags.length ? <p className="mt-1.5 text-[12px] text-[var(--muted)]">#{card.tags.join(' #')}</p> : null}
                      {canMove && card.status === 'active' ? (
                        <label className="mt-2 block">
                          <span className="sr-only">Mover {card.candidateName} para</span>
                          <select
                            className="select min-h-8 py-1 text-[13px]"
                            value={stageOf(card) ?? ''}
                            onChange={(event) => move(card.id, event.target.value)}
                            disabled={pending}
                          >
                            {stages.map((option) => (
                              <option key={option.id} value={option.id} disabled={option.kind === 'hired'}>
                                {option.id === stageOf(card) ? `Em: ${option.name}` : `Mover para ${option.name}`}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            </section>
          )
        })}
      </div>
    </div>
  )
}
