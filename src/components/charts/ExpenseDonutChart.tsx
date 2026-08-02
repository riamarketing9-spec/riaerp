import { useEffect, useState } from 'react'

const SIZE = 176
const STROKE = 26
const RADIUS = (SIZE - STROKE) / 2
const CENTER = SIZE / 2
const GAP_DEG = 3

function formatMoney(n: number) {
  return new Intl.NumberFormat('ru-RU').format(Math.round(n))
}

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

// Categorical identity (which category), capped at 3 explicit slices + an
// "Other" bucket -- a donut shows every pair of slices at once, and only the
// first three categorical slots in the palette clear the CVD/normal-vision
// floor for all-pairs comparison (see the dataviz skill's palette notes).
const SLICE_COLORS = ['var(--color-chart-pink)', 'var(--color-chart-blue)', 'var(--color-chart-green)', 'var(--color-chart-gray)']

export function ExpenseDonutChart({
  slices,
  totalLabel,
  tableToggleLabel,
}: {
  slices: { label: string; value: number }[]
  totalLabel: string
  tableToggleLabel: string
}) {
  const [tableOpen, setTableOpen] = useState(false)
  // Each arc sweeps in from zero, staggered, instead of appearing whole.
  const [grown, setGrown] = useState(false)
  useEffect(() => {
    setGrown(false)
    const id = requestAnimationFrame(() => setGrown(true))
    return () => cancelAnimationFrame(id)
  }, [slices.length])

  const total = slices.reduce((sum, s) => sum + s.value, 0)
  let cursor = 0
  const arcs = slices.map((s, i) => {
    const span = total > 0 ? (s.value / total) * (360 - slices.length * GAP_DEG) : 0
    const start = cursor
    const end = cursor + span
    cursor = end + GAP_DEG
    const arcLen = ((span * Math.PI) / 180) * RADIUS
    return { ...s, start, end, arcLen, color: SLICE_COLORS[i] ?? SLICE_COLORS[SLICE_COLORS.length - 1] }
  })

  return (
    <div>
      <div className="flex items-center gap-6">
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          width={SIZE}
          height={SIZE}
          className="cursor-pointer"
          onClick={() => setTableOpen((v) => !v)}
          role="button"
          aria-expanded={tableOpen}
        >
          <circle cx={CENTER} cy={CENTER} r={RADIUS} fill="none" stroke="var(--muted)" strokeWidth={STROKE} opacity={0.5} />
          {arcs.map((a, i) =>
            a.end > a.start ? (
              <path
                key={a.label}
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
            fontSize={20}
            style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
          >
            {formatMoney(total)}
          </text>
          <text x={CENTER} y={CENTER + 16} textAnchor="middle" className="fill-muted-foreground font-medium" fontSize={11}>
            {totalLabel}
          </text>
        </svg>
        <div className="flex flex-col gap-2">
          {arcs.map((a) => (
            <div key={a.label} className="flex items-center gap-2 text-sm">
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: a.color }} />
              <span className="font-medium text-foreground">{a.label}</span>
              <span className="text-muted-foreground">
                {total > 0 ? Math.round((a.value / total) * 100) : 0}%
              </span>
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
            {arcs.map((a) => (
              <tr key={a.label} className="border-b border-border/50">
                <td className="py-1">
                  <span className="mr-1.5 inline-block size-2.5 rounded-full align-middle" style={{ background: a.color }} />
                  {a.label}
                </td>
                <td className="py-1 text-right">{formatMoney(a.value)}</td>
                <td className="py-1 pl-2 text-right text-muted-foreground">
                  {total > 0 ? Math.round((a.value / total) * 100) : 0}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
