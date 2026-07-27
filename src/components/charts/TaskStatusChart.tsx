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
export function TaskStatusChart({ buckets }: { buckets: TaskStatusBucket[] }) {
  const [openKey, setOpenKey] = useState<string | null>(null)
  const max = Math.max(1, ...buckets.map((b) => b.count))
  const barW = (WIDTH - BAR_GAP * (buckets.length - 1)) / buckets.length
  const plotH = HEIGHT - 24

  return (
    <div>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full max-w-xs">
        {buckets.map((b, i) => {
          const h = (b.count / max) * plotH
          const x = i * (barW + BAR_GAP)
          const y = plotH - h
          return (
            <g
              key={b.key}
              className="cursor-pointer"
              onClick={() => setOpenKey((k) => (k === b.key ? null : b.key))}
              role="button"
              aria-expanded={openKey === b.key}
            >
              <rect x={x} y={y} width={barW} height={Math.max(h, 2)} rx={4} fill={b.color} />
              <text x={x + barW / 2} y={y - 6} textAnchor="middle" className="fill-foreground text-sm font-bold" fontSize={16}>
                {b.count}
              </text>
              <text x={x + barW / 2} y={HEIGHT - 6} textAnchor="middle" className="fill-muted-foreground" fontSize={11}>
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
                <div key={task.id} className="flex items-center justify-between gap-2 px-1 text-xs">
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">{task.title}</span>
                    {task.subtitle && <span className="truncate text-muted-foreground">{task.subtitle}</span>}
                  </span>
                  <DeadlineBadge deadline={task.deadline} />
                </div>
              ))
            )}
          </div>
        ) : null
      )}
    </div>
  )
}
