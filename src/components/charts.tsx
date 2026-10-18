import { formatNumber, formatPercent } from '@/lib/format'

/*
 * Gráficos SVG renderizados no servidor (sem JavaScript). Especificações seguidas:
 * barras ≤ 24px com topo arredondado de 4px e base recta, grelha hairline recessiva,
 * texto sempre em tokens de tinta (nunca na cor da série), legenda para 2+ séries,
 * tooltip nativo por marca e vista em tabela para leitores de ecrã e impressão.
 */

const BAR = 18
const GAP = 2

/** Caminho de barra horizontal: base recta à esquerda, extremidade arredondada (4px) à direita. */
function hBarPath(x: number, y: number, width: number, height: number, radius = 4): string {
  if (width <= 0) return ''
  const r = Math.min(radius, width / 2, height / 2)
  return `M${x},${y} H${x + width - r} Q${x + width},${y} ${x + width},${y + r} V${y + height - r} Q${x + width},${y + height} ${x + width - r},${y + height} H${x} Z`
}

/** Caminho de coluna: base recta em baixo, topo arredondado. */
function vBarPath(x: number, y: number, width: number, height: number, radius = 4): string {
  if (height <= 0) return ''
  const r = Math.min(radius, width / 2, height / 2)
  return `M${x},${y + height} V${y + r} Q${x},${y} ${x + r},${y} H${x + width - r} Q${x + width},${y} ${x + width},${y + r} V${y + height} Z`
}

function niceMax(value: number): number {
  if (value <= 4) return 4
  const magnitude = 10 ** Math.floor(Math.log10(value))
  const step = [1, 2, 2.5, 5, 10].map((factor) => factor * magnitude).find((candidate) => candidate * 4 >= value) ?? magnitude * 10
  return step * 4
}

function TableView({ caption, headers, rows }: { caption: string; headers: string[]; rows: (string | number)[][] }) {
  return (
    <details className="mt-3 text-sm">
      <summary className="cursor-pointer text-[var(--muted)] hover:text-[var(--ink)]">Ver dados em tabela</summary>
      <table className="table mt-2">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header} scope="col">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className={typeof cell === 'number' ? 'nums' : undefined}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  )
}

export function HorizontalBars({ title, rows, valueLabel }: { title: string; rows: { label: string; value: number; note?: string }[]; valueLabel: string }) {
  const max = Math.max(1, ...rows.map((row) => row.value))
  const labelWidth = 150
  const width = 560
  const plot = width - labelWidth - 48
  const rowHeight = BAR + 14
  const height = rows.length * rowHeight + 4
  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label={`${title}: ${rows.map((row) => `${row.label} ${row.value}`).join(', ')}`}>
        {rows.map((row, index) => {
          const y = index * rowHeight + 4
          const barWidth = (row.value / max) * plot
          return (
            <g key={row.label} className="group">
              <title>{`${row.label}: ${formatNumber(row.value)} ${valueLabel}${row.note ? ` · ${row.note}` : ''}`}</title>
              <rect x={0} y={y - 4} width={width} height={rowHeight} fill="transparent" />
              <text x={labelWidth - 10} y={y + BAR / 2} textAnchor="end" dominantBaseline="central" fontSize="13" fill="var(--ink)">
                {row.label}
              </text>
              <rect x={labelWidth} y={y} width={plot} height={BAR} fill="var(--grid)" opacity="0.5" rx="4" />
              <path d={hBarPath(labelWidth, y, Math.max(barWidth, row.value > 0 ? 6 : 0), BAR)} fill="var(--chart-1)" className="transition-opacity group-hover:opacity-80" />
              <text x={labelWidth + Math.max(barWidth, 6) + 8} y={y + BAR / 2} dominantBaseline="central" fontSize="13" fontWeight="600" fill="var(--ink)" className="nums">
                {formatNumber(row.value)}
              </text>
            </g>
          )
        })}
      </svg>
      <TableView caption={title} headers={['Categoria', valueLabel]} rows={rows.map((row) => [row.label, row.value])} />
    </figure>
  )
}

export interface SeriesPoint {
  label: string
  values: [number, number]
}

/** Colunas agrupadas para duas séries na mesma unidade (um só eixo). */
export function GroupedColumns({ title, series, points }: { title: string; series: [string, string]; points: SeriesPoint[] }) {
  const width = 640
  const height = 220
  const left = 32
  const bottom = 28
  const top = 10
  const plotH = height - bottom - top
  const plotW = width - left - 8
  const max = niceMax(Math.max(1, ...points.flatMap((point) => point.values)))
  const slot = plotW / Math.max(points.length, 1)
  const barW = Math.min(14, (slot - 10) / 2)
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((fraction) => Math.round(max * fraction))
  const colors = ['var(--chart-1)', 'var(--chart-2)']
  return (
    <figure className="m-0">
      <div className="mb-2 flex flex-wrap gap-4 text-[13px] text-[var(--muted)]" aria-hidden="true">
        {series.map((name, index) => (
          <span key={name} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: colors[index] }} />
            {name}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label={`${title}. ${series[0]} e ${series[1]} por semana.`}>
        {ticks.map((tick) => {
          const y = top + plotH - (tick / max) * plotH
          return (
            <g key={tick}>
              <line x1={left} x2={width - 8} y1={y} y2={y} stroke="var(--grid)" strokeWidth="1" />
              <text x={left - 6} y={y} textAnchor="end" dominantBaseline="central" fontSize="11" fill="var(--muted)" className="nums">
                {tick}
              </text>
            </g>
          )
        })}
        {points.map((point, index) => {
          const x0 = left + index * slot + (slot - (barW * 2 + GAP)) / 2
          return (
            <g key={point.label} className="group">
              <title>{`Semana de ${point.label}: ${point.values[0]} ${series[0].toLowerCase()}, ${point.values[1]} ${series[1].toLowerCase()}`}</title>
              <rect x={left + index * slot} y={top} width={slot} height={plotH} fill="transparent" className="group-hover:fill-[var(--surface)]" opacity="0.5" />
              {point.values.map((value, seriesIndex) => {
                const h = (value / max) * plotH
                return <path key={seriesIndex} d={vBarPath(x0 + seriesIndex * (barW + GAP), top + plotH - h, barW, h)} fill={colors[seriesIndex]} />
              })}
              {index % Math.ceil(points.length / 7) === 0 ? (
                <text x={left + index * slot + slot / 2} y={height - 8} textAnchor="middle" fontSize="11" fill="var(--muted)">
                  {point.label}
                </text>
              ) : null}
            </g>
          )
        })}
      </svg>
      <TableView caption={title} headers={['Semana', ...series]} rows={points.map((point) => [point.label, ...point.values])} />
    </figure>
  )
}

/** Funil: cada etapa mostra quantas candidaturas a atingiram e a conversão face à anterior. */
export function Funnel({ steps }: { steps: { label: string; reached: number }[] }) {
  const first = steps[0]?.reached ?? 0
  return (
    <figure className="m-0">
      <ol className="space-y-2" aria-label="Funil de recrutamento">
        {steps.map((step, index) => {
          const previous = index === 0 ? null : steps[index - 1]!.reached
          const share = first > 0 ? step.reached / first : 0
          const conversion = previous ? step.reached / previous : null
          return (
            <li key={step.label} className="grid grid-cols-[130px_1fr_auto] items-center gap-3 text-[13.5px]" title={`${step.label}: ${step.reached} candidaturas${conversion !== null ? ` (${formatPercent(conversion)} da etapa anterior)` : ''}`}>
              <span>{step.label}</span>
              <span className="relative h-[18px] rounded-[4px] bg-[var(--surface)]">
                <span className="absolute inset-y-0 left-0 rounded-r-[4px] bg-[var(--chart-1)]" style={{ width: `${Math.max(share * 100, step.reached > 0 ? 2 : 0)}%` }} />
              </span>
              <span className="nums w-24 text-right">
                <strong>{step.reached}</strong>
                {conversion !== null ? <span className="ml-1 text-[var(--muted)]">{formatPercent(conversion)}</span> : null}
              </span>
            </li>
          )
        })}
      </ol>
      <figcaption className="mt-2 text-[12.5px] text-[var(--muted)]">Candidaturas do período que chegaram pelo menos a cada etapa · % face à etapa anterior.</figcaption>
    </figure>
  )
}

function StatusIcon({ ok }: { ok: boolean }) {
  return ok ? (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <circle cx="8" cy="8" r="8" fill="currentColor" />
      <path d="M4.5 8.2 7 10.6l4.5-5" stroke="#fff" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ) : (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <circle cx="8" cy="8" r="8" fill="currentColor" />
      <path d="M8 4.2v4.6M8 11.2v.2" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  )
}

export function StatTile({ label, value, definition, target, onTarget }: { label: string; value: string; definition: string; target: string | null; onTarget: boolean | null }) {
  return (
    <div className="panel flex flex-col gap-2 p-4" data-reveal>
      <p className="text-[13px] font-semibold text-[var(--muted)]">{label}</p>
      <p className="text-[30px] font-semibold leading-none tracking-tight">{value}</p>
      <div className="mt-auto flex flex-wrap items-center gap-2 text-[12.5px]">
        {target ? <span className="text-[var(--muted)]">Meta do piloto {target}</span> : null}
        {onTarget === true ? (
          <span className="inline-flex items-center gap-1 font-semibold text-[var(--ok)]">
            <StatusIcon ok /> Na meta
          </span>
        ) : onTarget === false ? (
          <span className="inline-flex items-center gap-1 font-semibold text-[var(--warn)]">
            <StatusIcon ok={false} /> Abaixo da meta
          </span>
        ) : null}
      </div>
      <details className="text-[12.5px] text-[var(--muted)]">
        <summary className="cursor-pointer hover:text-[var(--ink)]">Definição</summary>
        <p className="mt-1">{definition}</p>
      </details>
    </div>
  )
}
