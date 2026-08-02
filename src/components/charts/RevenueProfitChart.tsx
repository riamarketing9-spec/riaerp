import { useEffect, useMemo, useRef, useState } from 'react'

type MonthPoint = { monthLabel: string; revenue: number; profit: number }

const WIDTH = 640
const HEIGHT = 220
const PAD_LEFT = 48
const PAD_RIGHT = 12
const PAD_TOP = 12
const PAD_BOTTOM = 28

function formatCompact(n: number) {
  return new Intl.NumberFormat('ru-RU', { notation: 'compact', maximumFractionDigits: 1 }).format(n)
}

// A single-axis area+line chart: revenue as a soft-filled area (the primary
// magnitude), profit as a plain line on top (same currency unit, so one
// shared y-scale is correct -- never a second axis for a second series).
export function RevenueProfitChart({
  data,
  revenueLabel,
  profitLabel,
  tableToggleLabel,
}: {
  data: MonthPoint[]
  revenueLabel: string
  profitLabel: string
  tableToggleLabel: string
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const [tableOpen, setTableOpen] = useState(false)
  const revenueLineRef = useRef<SVGPathElement>(null)
  const profitLineRef = useRef<SVGPathElement>(null)
  const [drawn, setDrawn] = useState(false)

  const plotW = WIDTH - PAD_LEFT - PAD_RIGHT
  const plotH = HEIGHT - PAD_TOP - PAD_BOTTOM

  const { maxVal, minVal } = useMemo(() => {
    const all = data.flatMap((d) => [d.revenue, d.profit])
    return { maxVal: Math.max(0, ...all), minVal: Math.min(0, ...all) }
  }, [data])

  const range = maxVal - minVal || 1
  const xFor = (i: number) => PAD_LEFT + (data.length <= 1 ? 0 : (i / (data.length - 1)) * plotW)
  const yFor = (v: number) => PAD_TOP + plotH - ((v - minVal) / range) * plotH
  const zeroY = yFor(0)

  const revenuePath = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${xFor(i)},${yFor(d.revenue)}`).join(' ')
  const profitPath = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${xFor(i)},${yFor(d.profit)}`).join(' ')
  const revenueArea =
    `${revenuePath} L${xFor(data.length - 1)},${zeroY} L${xFor(0)},${zeroY} Z`

  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((f) => PAD_TOP + f * plotH)

  // The lines draw themselves in on mount (stroke-dasharray trick) instead
  // of appearing pre-drawn -- one deliberate reveal, not a static image.
  useEffect(() => {
    setDrawn(false)
    const refs = [revenueLineRef, profitLineRef]
    const id = requestAnimationFrame(() => {
      for (const ref of refs) {
        const len = ref.current?.getTotalLength()
        if (ref.current && len) {
          ref.current.style.strokeDasharray = `${len}`
          ref.current.style.strokeDashoffset = `${len}`
        }
      }
      requestAnimationFrame(() => {
        for (const ref of refs) {
          if (ref.current) ref.current.style.strokeDashoffset = '0'
        }
        setDrawn(true)
      })
    })
    return () => cancelAnimationFrame(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.length, revenuePath, profitPath])

  const lastIndex = data.length - 1

  return (
    <div className="viz-root">
      <div className="mb-3 flex items-center gap-4 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full" style={{ background: 'var(--chart-revenue)', boxShadow: '0 0 8px var(--chart-revenue)' }} />
          <span className="font-medium text-muted-foreground">{revenueLabel}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full" style={{ background: 'var(--chart-profit)', boxShadow: '0 0 8px var(--chart-profit)' }} />
          <span className="font-medium text-muted-foreground">{profitLabel}</span>
        </span>
      </div>

      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full cursor-pointer overflow-visible"
        style={{ ['--chart-revenue' as string]: 'var(--color-brand-600)', ['--chart-profit' as string]: 'var(--color-amber-accent)' }}
        onMouseLeave={() => setHoverIndex(null)}
        onClick={() => setTableOpen((v) => !v)}
        role="button"
        aria-expanded={tableOpen}
      >
        <defs>
          <linearGradient id="revenue-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-revenue)" stopOpacity="0.32" />
            <stop offset="100%" stopColor="var(--chart-revenue)" stopOpacity="0" />
          </linearGradient>
          <filter id="line-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="3.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {gridLines.map((y) => (
          <line key={y} x1={PAD_LEFT} x2={WIDTH - PAD_RIGHT} y1={y} y2={y} stroke="var(--border)" strokeWidth={1} />
        ))}

        <path
          d={revenueArea}
          fill="url(#revenue-fill)"
          stroke="none"
          style={{ opacity: drawn ? 1 : 0, transition: 'opacity 900ms var(--ease-out-strong) 200ms' }}
        />
        <path
          ref={revenueLineRef}
          d={revenuePath}
          fill="none"
          stroke="var(--chart-revenue)"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          filter="url(#line-glow)"
          style={{ transition: 'stroke-dashoffset 1100ms var(--ease-out-strong)' }}
        />
        <path
          ref={profitLineRef}
          d={profitPath}
          fill="none"
          stroke="var(--chart-profit)"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ transition: 'stroke-dashoffset 1100ms var(--ease-out-strong) 120ms' }}
        />

        {/* pulsing "live" marker on the latest point */}
        {lastIndex >= 0 && drawn && (
          <circle cx={xFor(lastIndex)} cy={yFor(data[lastIndex].revenue)} r={5} fill="var(--chart-revenue)" className="animate-glow-pulse" />
        )}

        {data.map((d, i) => (
          <g key={d.monthLabel}>
            <rect
              x={xFor(i) - plotW / (data.length * 2)}
              y={PAD_TOP}
              width={plotW / data.length}
              height={plotH}
              fill="transparent"
              onMouseEnter={() => setHoverIndex(i)}
            />
            {hoverIndex === i && (
              <line x1={xFor(i)} x2={xFor(i)} y1={PAD_TOP} y2={PAD_TOP + plotH} stroke="var(--muted-foreground)" strokeWidth={1} strokeDasharray="3 3" />
            )}
            <circle cx={xFor(i)} cy={yFor(d.revenue)} r={hoverIndex === i ? 5 : 0} fill="var(--chart-revenue)" style={{ transition: 'r 150ms var(--ease-spring)' }} />
            <circle cx={xFor(i)} cy={yFor(d.profit)} r={hoverIndex === i ? 5 : 0} fill="var(--chart-profit)" style={{ transition: 'r 150ms var(--ease-spring)' }} />
          </g>
        ))}

        {data.map((d, i) => (
          <text key={d.monthLabel} x={xFor(i)} y={HEIGHT - 8} textAnchor="middle" className="fill-muted-foreground font-medium" fontSize={11}>
            {d.monthLabel}
          </text>
        ))}
        {gridLines.map((y) => (
          <text key={y} x={PAD_LEFT - 8} y={y + 3} textAnchor="end" className="fill-muted-foreground" fontSize={10}>
            {formatCompact(minVal + ((PAD_TOP + plotH - y) / plotH) * range)}
          </text>
        ))}
      </svg>

      {hoverIndex !== null && data[hoverIndex] && (
        <div className="mt-2 flex animate-fade-in-up gap-4 rounded-lg border border-border bg-muted/20 px-3 py-1.5 text-xs shadow-sm">
          <span className="font-semibold">{data[hoverIndex].monthLabel}</span>
          <span className="font-medium" style={{ color: 'var(--chart-revenue)' }}>{revenueLabel}: {formatCompact(data[hoverIndex].revenue)}</span>
          <span className="font-medium" style={{ color: 'var(--chart-profit)' }}>{profitLabel}: {formatCompact(data[hoverIndex].profit)}</span>
        </div>
      )}

      <button
        type="button"
        className="mt-2 text-xs text-muted-foreground underline-offset-2 hover:underline"
        onClick={() => setTableOpen((v) => !v)}
      >
        {tableToggleLabel}
      </button>

      {tableOpen && (
        <table className="mt-2 w-full text-xs">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="py-1 font-normal">{' '}</th>
              <th className="py-1 font-normal" style={{ color: 'var(--chart-revenue)' }}>{revenueLabel}</th>
              <th className="py-1 font-normal" style={{ color: 'var(--chart-profit)' }}>{profitLabel}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.monthLabel} className="border-b border-border/50">
                <td className="py-1 font-medium">{d.monthLabel}</td>
                <td className="py-1">{formatCompact(d.revenue)}</td>
                <td className="py-1">{formatCompact(d.profit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
