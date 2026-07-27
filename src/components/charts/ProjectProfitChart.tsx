const POSITIVE_COLOR = '#0a4235'
const NEGATIVE_COLOR = '#a3c9bc'

function formatMoney(n: number) {
  return new Intl.NumberFormat('ru-RU').format(Math.round(n))
}

// Horizontal bars scaled off the largest magnitude in either direction --
// profit and loss share one axis, so a losing project reads as a short pale
// bar rather than vanishing or breaking the scale.
export function ProjectProfitChart({ data }: { data: { projectId: string; name: string; profit: number }[] }) {
  if (data.length === 0) return null

  const maxAbs = Math.max(1, ...data.map((d) => Math.abs(d.profit)))

  return (
    <div className="flex flex-col gap-2">
      {data.map((d) => {
        const isPositive = d.profit >= 0
        const widthPct = (Math.abs(d.profit) / maxAbs) * 100
        return (
          <div key={d.projectId} className="flex items-center gap-2">
            <span className="w-28 shrink-0 truncate text-xs text-foreground">{d.name}</span>
            <span className="h-4 flex-1 overflow-hidden rounded bg-muted">
              <span
                className="block h-full rounded"
                style={{ width: `${widthPct}%`, background: isPositive ? POSITIVE_COLOR : NEGATIVE_COLOR }}
              />
            </span>
            <span className="w-20 shrink-0 text-right text-xs font-medium text-foreground">
              {formatMoney(d.profit)}
            </span>
          </div>
        )
      })}
    </div>
  )
}
