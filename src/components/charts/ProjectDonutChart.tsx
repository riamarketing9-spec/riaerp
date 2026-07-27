import { useState } from 'react'
import type { ProjectTaskBar } from './ProjectTasksChart'

const SIZE = 176
const STROKE = 26
const RADIUS = (SIZE - STROKE) / 2
const CENTER = SIZE / 2
const GAP_DEG = 3

// Brand-green ramp (dark to light), cycled if there are more projects than
// shades -- deliberately monochrome to match the ERP's own palette instead
// of arbitrary categorical hues.
const SLICE_COLORS = ['#0a4235', '#0d5142', '#0f5d4c', '#468f76', '#74ad99', '#a3c9bc']

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

// A donut over the same per-project bar data as ProjectTasksChart -- reuses
// its row shape so the two charts can sit side by side showing the same
// kind of breakdown in genuinely different visual forms. Clicking a slice
// or its legend row expands that project's item list, same as the bar chart.
export function ProjectDonutChart({ bars, totalLabel }: { bars: ProjectTaskBar[]; totalLabel: string }) {
  const [openId, setOpenId] = useState<string | null>(null)
  const total = bars.reduce((sum, b) => sum + b.count, 0)

  if (bars.length === 0) return null

  let cursor = 0
  const arcs = bars.map((b, i) => {
    const span = total > 0 ? (b.count / total) * (360 - bars.length * GAP_DEG) : 0
    const start = cursor
    const end = cursor + span
    cursor = end + GAP_DEG
    return { ...b, start, end, color: SLICE_COLORS[i % SLICE_COLORS.length] }
  })

  return (
    <div>
      <div className="flex items-center gap-6">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE}>
          {arcs.map((a) =>
            a.end > a.start ? (
              <path
                key={a.projectId}
                d={arcPath(a.start, a.end)}
                fill="none"
                stroke={a.color}
                strokeWidth={STROKE}
                strokeLinecap="round"
                className="cursor-pointer"
                onClick={() => setOpenId((id) => (id === a.projectId ? null : a.projectId))}
              />
            ) : null
          )}
          <text x={CENTER} y={CENTER - 4} textAnchor="middle" className="fill-foreground text-2xl font-bold" fontSize={22}>
            {total}
          </text>
          <text x={CENTER} y={CENTER + 16} textAnchor="middle" className="fill-muted-foreground" fontSize={11}>
            {totalLabel}
          </text>
        </svg>
        <div className="flex flex-col gap-2">
          {arcs.map((a) => (
            <button
              key={a.projectId}
              type="button"
              className="flex items-center gap-2 text-left text-sm"
              onClick={() => setOpenId((id) => (id === a.projectId ? null : a.projectId))}
              aria-expanded={openId === a.projectId}
            >
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: a.color }} />
              <span className="truncate text-foreground">{a.projectName}</span>
              <span className="text-muted-foreground">{a.count}</span>
            </button>
          ))}
        </div>
      </div>

      {arcs.map((a) =>
        openId === a.projectId ? (
          <div key={a.projectId} className="mt-2 flex flex-col gap-1 rounded-md border border-border p-2">
            {a.tasks.length === 0 ? (
              <p className="px-1 text-xs text-muted-foreground">—</p>
            ) : (
              a.tasks.map((task) => (
                <div key={task.id} className="flex items-center justify-between gap-2 px-1 text-xs">
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">{task.title}</span>
                    {task.subtitle && <span className="truncate text-muted-foreground">{task.subtitle}</span>}
                  </span>
                  <span className="shrink-0 text-muted-foreground">
                    {task.deadline ? new Date(task.deadline).toLocaleDateString() : '—'}
                  </span>
                </div>
              ))
            )}
          </div>
        ) : null
      )}
    </div>
  )
}
