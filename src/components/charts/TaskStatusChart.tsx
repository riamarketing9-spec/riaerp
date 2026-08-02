import { useState } from 'react'
import { DeadlineBadge } from './DeadlineBadge'

export type TaskStatusBucket = {
  key: string
  label: string
  count: number
  color: string
  tasks: { id: string; title: string; deadline: string | null; subtitle?: string | null }[]
}

const WIDTH = 320
const HEIGHT = 140
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
  const max = Math.max(1, ...buckets.map((b) => b.count))
  const barW = (WIDTH - BAR_GAP * (buckets.length - 1)) / buckets.length
  const plotH = HEIGHT - 24

  return (
    <div>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full max-w-xs overflow-visible">
        <defs>
          {buckets.map((b) => (
            <linearGradient key={b.key} id={`taskbar-${b.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={b.color} stopOpacity={1} />
              <stop offset="100%" stopColor={b.color} stopOpacity={0.72} />
            </linearGradient>
          ))}
        </defs>
        {buckets.map((b, i) => {
          const h = (b.count / max) * plotH
          const x = i * (barW + BAR_GAP)
          const y = plotH - h
          return (
            <g
              key={b.key}
              className="cursor-pointer transition-opacity hover:opacity-80"
              onClick={() => setOpenKey((k) => (k === b.key ? null : b.key))}
              role="button"
              aria-expanded={openKey === b.key}
            >
              {/* faint full-height track so short bars aren't floating with no baseline reference */}
              <rect x={x} y={0} width={barW} height={plotH} rx={6} className="fill-muted/50" />
              <rect
                x={x}
                y={y}
                width={barW}
                height={Math.max(h, 3)}
                rx={6}
                fill={`url(#taskbar-${b.key})`}
                style={{ transition: 'height 500ms var(--ease-out-strong), y 500ms var(--ease-out-strong)' }}
              />
              <text x={x + barW / 2} y={y - 8} textAnchor="middle" className="fill-foreground text-sm font-bold" fontSize={16}>
                {b.count}
              </text>
              <text x={x + barW / 2} y={HEIGHT - 6} textAnchor="middle" className="fill-muted-foreground font-medium" fontSize={11}>
                {b.label}
              </text>
            </g>
          )
        })}
      </svg>

      {buckets.map((b) =>
        openKey === b.key ? (
          <div key={b.key} className="mt-2 flex flex-col gap-1 rounded-md border border-border p-2">
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
