import { useEffect, useState } from 'react'
import type { ChecklistVerdict } from '@/lib/checklistVerdict'

const SIZE = 176
const STROKE = 26
const RADIUS = (SIZE - STROKE) / 2
const CENTER = SIZE / 2
const GAP_DEG = 3

function arcPath(startDeg: number, endDeg: number) {
  const start = ((startDeg - 90) * Math.PI) / 180
  const end = ((endDeg - 90) * Math.PI) / 180
  const x1 = CENTER + RADIUS * Math.cos(start)
  const y1 = CENTER + RADIUS * Math.sin(start)
  const x2 = CENTER + RADIUS * Math.cos(end)
  const y2 = CENTER + RADIUS * Math.sin(end)
  const largeArc = endDeg - startDeg > 180 ? 1 : 0
  return `M${x1},${y1} A${RADIUS},${RADIUS} 0 ${largeArc} 1 ${x2},${y2}`
}

// Fixed semantic colors (not the categorical ExpenseDonutChart palette) --
// same 3-state terminology as the Telegram bot report (see
// src/lib/checklistVerdict.ts), so green/red/amber always mean the same
// thing everywhere the team sees them.
const VERDICT_COLORS: Record<ChecklistVerdict, string> = {
  'сделано': 'var(--color-chart-green)',
  'не сделано': 'var(--color-chart-red)',
  'планируется': 'var(--color-chart-amber)',
}

export type ChecklistAnalysisItem = {
  id: string
  title: string
  verdict: ChecklistVerdict
  assigneeName?: string
}

export function ChecklistAnalysisChart({
  items,
  doneLabel,
  notDoneLabel,
  plannedLabel,
  tableToggleLabel,
}: {
  items: ChecklistAnalysisItem[]
  doneLabel: string
  notDoneLabel: string
  plannedLabel: string
  tableToggleLabel: string
}) {
  const [tableOpen, setTableOpen] = useState(false)
  const [grown, setGrown] = useState(false)
  useEffect(() => {
    setGrown(false)
    const id = requestAnimationFrame(() => setGrown(true))
    return () => cancelAnimationFrame(id)
  }, [items.length])

  const total = items.length
  const counts: Record<ChecklistVerdict, number> = {
    'сделано': items.filter((i) => i.verdict === 'сделано').length,
    'не сделано': items.filter((i) => i.verdict === 'не сделано').length,
    'планируется': items.filter((i) => i.verdict === 'планируется').length,
  }
  const doneCount = counts['сделано']
  const percent = total > 0 ? Math.round((doneCount / total) * 100) : 0

  const order: ChecklistVerdict[] = ['сделано', 'не сделано', 'планируется']
  const labels: Record<ChecklistVerdict, string> = {
    'сделано': doneLabel,
    'не сделано': notDoneLabel,
    'планируется': plannedLabel,
  }

  let cursor = 0
  const nonZeroCount = order.filter((v) => counts[v] > 0).length
  const arcs = order.map((v) => {
    const value = counts[v]
    const span = total > 0 && value > 0 ? (value / total) * (360 - nonZeroCount * GAP_DEG) : 0
    const start = cursor
    const end = cursor + span
    if (span > 0) cursor = end + GAP_DEG
    const arcLen = ((span * Math.PI) / 180) * RADIUS
    return { verdict: v, value, start, end, arcLen, color: VERDICT_COLORS[v], label: labels[v] }
  })

  return (
    <div>
      <div className="flex items-center gap-6">
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          width={SIZE}
          height={SIZE}
          className="shrink-0 cursor-pointer"
          onClick={() => setTableOpen((v) => !v)}
          role="button"
          aria-expanded={tableOpen}
        >
          <circle cx={CENTER} cy={CENTER} r={RADIUS} fill="none" stroke="var(--muted)" strokeWidth={STROKE} opacity={0.5} />
          {arcs.map((a, i) =>
            a.end > a.start ? (
              <path
                key={a.verdict}
                d={arcPath(a.start, a.end)}
                fill="none"
                stroke={a.color}
                strokeWidth={STROKE}
                strokeLinecap="round"
                className="origin-center transition-[opacity,transform] duration-200 hover:scale-[1.02] hover:opacity-85"
                style={{
                  transformBox: 'fill-box',
                  strokeDasharray: a.arcLen,
                  strokeDashoffset: grown ? 0 : a.arcLen,
                  transition: `stroke-dashoffset 750ms var(--ease-out-strong) ${i * 120}ms, opacity 200ms, transform 200ms`,
                }}
              />
            ) : null
          )}
          <text
            x={CENTER}
            y={CENTER - 4}
            textAnchor="middle"
            className="fill-foreground font-semibold animate-pop-in"
            fontSize={22}
            style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
          >
            {percent}%
          </text>
          <text x={CENTER} y={CENTER + 16} textAnchor="middle" className="fill-muted-foreground font-medium" fontSize={11}>
            {doneCount}/{total}
          </text>
        </svg>
        <div className="flex flex-col gap-2">
          {arcs.map((a) => (
            <div key={a.verdict} className="flex items-center gap-2 text-sm">
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: a.color }} />
              <span className="font-medium text-foreground">{a.label}</span>
              <span className="text-muted-foreground">{a.value}</span>
            </div>
          ))}
        </div>
      </div>

      <button
        type="button"
        className="mt-2 text-xs text-muted-foreground underline-offset-2 hover:underline"
        onClick={() => setTableOpen((v) => !v)}
      >
        {tableToggleLabel}
      </button>

      {tableOpen && (
        <table className="mt-2 w-full text-xs">
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-border/50">
                <td className="py-1">
                  <span
                    className="mr-1.5 inline-block size-2.5 rounded-full align-middle"
                    style={{ background: VERDICT_COLORS[item.verdict] }}
                  />
                  {item.title}
                  {item.assigneeName && (
                    <span className="ml-1.5 text-muted-foreground">({item.assigneeName})</span>
                  )}
                </td>
                <td className="py-1 pl-2 text-right text-muted-foreground">{labels[item.verdict]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
