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
const SLICE_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#9b9a97']

export function ExpenseDonutChart({
  slices,
  totalLabel,
}: {
  slices: { label: string; value: number }[]
  totalLabel: string
}) {
  const total = slices.reduce((sum, s) => sum + s.value, 0)
  let cursor = 0
  const arcs = slices.map((s, i) => {
    const span = total > 0 ? (s.value / total) * (360 - slices.length * GAP_DEG) : 0
    const start = cursor
    const end = cursor + span
    cursor = end + GAP_DEG
    return { ...s, start, end, color: SLICE_COLORS[i] ?? SLICE_COLORS[SLICE_COLORS.length - 1] }
  })

  return (
    <div className="flex items-center gap-6">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE}>
        {arcs.map((a) =>
          a.end > a.start ? (
            <path
              key={a.label}
              d={arcPath(a.start, a.end)}
              fill="none"
              stroke={a.color}
              strokeWidth={STROKE}
              strokeLinecap="round"
            />
          ) : null
        )}
        <text x={CENTER} y={CENTER - 4} textAnchor="middle" className="fill-foreground text-2xl font-bold" fontSize={22}>
          {formatMoney(total)}
        </text>
        <text x={CENTER} y={CENTER + 16} textAnchor="middle" className="fill-muted-foreground" fontSize={11}>
          {totalLabel}
        </text>
      </svg>
      <div className="flex flex-col gap-2">
        {arcs.map((a) => (
          <div key={a.label} className="flex items-center gap-2 text-sm">
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: a.color }} />
            <span className="text-foreground">{a.label}</span>
            <span className="text-muted-foreground">
              {total > 0 ? Math.round((a.value / total) * 100) : 0}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
