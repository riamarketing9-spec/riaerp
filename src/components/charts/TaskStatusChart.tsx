import { useEffect, useState } from 'react'
import { DeadlineBadge } from './DeadlineBadge'

export type TaskStatusBucket = {
  key: string
  label: string
  count: number
  color: string
  tasks: { id: string; title: string; deadline: string | null; subtitle?: string | null }[]
}

const WIDTH = 320
const HEIGHT = 148
const BAR_GAP = 24

// A small status-colored bar chart (in progress / overdue / due soon) --
// status colors, not categorical hues, per the dataviz skill: these are
// states of the same underlying pool of tasks, not distinct identities.
export function TaskStatusChart({
  buckets,
  onItemClick,
}: {
  buckets: TaskStatusBucket[]
  onItemClick?: (id: string) => void
}) {
  const [openKey, setOpenKey] = useState<string | null>(null)
  // Bars grow in from zero on mount instead of appearing fully-formed --
  // one deliberate entrance moment reads as "alive", not scattered fidgets.
  const [grown, setGrown] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setGrown(true))
    return () => cancelAnimationFrame(id)
  }, [])

  const max = Math.max(1, ...buckets.map((b) => b.count))
  const barW = (WIDTH - BAR_GAP * (buckets.length - 1)) / buckets.length
  const plotH = HEIGHT - 30

  return (
    <div>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full max-w-xs overflow-visible">
        <defs>
          {buckets.map((b) => (
            <linearGradient key={b.key} id={`taskbar-${b.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={b.color} stopOpacity={1} />
              <stop offset="100%" stopColor={b.color} stopOpacity={0.55} />
            </linearGradient>
          ))}
          <filter id="taskbar-glow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {buckets.map((b, i) => {
          const h = grown ? (b.count / max) * plotH : 0
          const x = i * (barW + BAR_GAP)
          const y = plotH - h
          return (
            <g
              key={b.key}
              className="group cursor-pointer"
              onClick={() => setOpenKey((k) => (k === b.key ? null : b.key))}
              role="button"
              aria-expanded={openKey === b.key}
            >
              {/* faint full-height track so short bars aren't floating with no baseline reference */}
              <rect x={x} y={0} width={barW} height={plotH} rx={8} className="fill-muted/40" />
              {b.count > 0 && (
                <ellipse
                  cx={x + barW / 2}
                  cy={plotH}
                  rx={barW / 2}
                  ry={4}
                  fill={b.color}
                  opacity={grown ? 0.35 : 0}
                  style={{ transition: 'opacity 700ms var(--ease-out-strong) 200ms' }}
                />
              )}
              <rect
                x={x}
                y={y}
                width={barW}
                height={Math.max(h, b.count > 0 ? 4 : 0)}
                rx={8}
                fill={`url(#taskbar-${b.key})`}
                filter="url(#taskbar-glow)"
                className="transition-[filter] duration-200 group-hover:brightness-110"
                style={{ transition: 'height 700ms var(--ease-spring), y 700ms var(--ease-spring)' }}
              />
              <text
                x={x + barW / 2}
                y={y - 10}
                textAnchor="middle"
                className="fill-foreground text-sm font-extrabold transition-opacity duration-500"
                fontSize={18}
                style={{ opacity: grown ? 1 : 0, transitionDelay: '400ms' }}
              >
                {b.count}
              </text>
              <text x={x + barW / 2} y={HEIGHT - 8} textAnchor="middle" className="fill-muted-foreground font-semibold uppercase tracking-wide" fontSize={10}>
                {b.label}
              </text>
            </g>
          )
        })}
      </svg>

      {buckets.map((b) =>
        openKey === b.key ? (
          <div key={b.key} className="mt-2 flex animate-fade-in-up flex-col gap-1 rounded-lg border border-border bg-muted/20 p-2">
            {b.tasks.length === 0 ? (
              <p className="px-1 text-xs text-muted-foreground">—</p>
            ) : (
              b.tasks.map((task) => (
                <button
                  key={task.id}
                  type="button"
                  disabled={!onItemClick}
                  onClick={() => onItemClick?.(task.id)}
                  className="flex items-center justify-between gap-2 rounded px-1 py-0.5 text-left text-xs enabled:hover:bg-muted"
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">{task.title}</span>
                    {task.subtitle && <span className="truncate text-muted-foreground">{task.subtitle}</span>}
                  </span>
                  <DeadlineBadge deadline={task.deadline} />
                </button>
              ))
            )}
          </div>
        ) : null
      )}
    </div>
  )
}
