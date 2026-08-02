import { useEffect, useState } from 'react'
import { DeadlineBadge } from './DeadlineBadge'

export type ProjectTaskBar = {
  projectId: string
  projectName: string
  count: number
  tasks: { id: string; title: string; deadline: string | null; subtitle?: string | null }[]
}

// Horizontal bar list, one hue -- each bar is directly labeled with the
// project name, so categorical distinctness between bars isn't needed here.
const BAR_COLOR = 'var(--color-brand-500)'

export function ProjectTasksChart({
  bars,
  color = BAR_COLOR,
  onItemClick,
}: {
  bars: ProjectTaskBar[]
  color?: string
  onItemClick?: (id: string) => void
}) {
  const [openId, setOpenId] = useState<string | null>(null)
  // Bars sweep in from zero width on mount, staggered per row.
  const [grown, setGrown] = useState(false)
  useEffect(() => {
    setGrown(false)
    const id = requestAnimationFrame(() => setGrown(true))
    return () => cancelAnimationFrame(id)
  }, [bars.length])

  const max = Math.max(1, ...bars.map((b) => b.count))

  if (bars.length === 0) return null

  return (
    <div className="flex flex-col gap-2.5">
      {bars.map((b, i) => (
        <div key={b.projectId}>
          <button
            type="button"
            className="group flex w-full items-center gap-2.5 rounded-md py-0.5 text-left transition-colors hover:bg-accent/60"
            onClick={() => setOpenId((id) => (id === b.projectId ? null : b.projectId))}
            aria-expanded={openId === b.projectId}
          >
            <span className="w-28 shrink-0 truncate text-xs font-medium text-foreground">{b.projectName}</span>
            <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
              <span
                className="block h-full rounded-full"
                style={{
                  width: grown ? `${Math.max((b.count / max) * 100, b.count > 0 ? 4 : 0)}%` : '0%',
                  background: `linear-gradient(90deg, ${color}, color-mix(in oklch, ${color}, white 25%))`,
                  boxShadow: b.count > 0 ? `0 0 10px -2px ${color}` : 'none',
                  transition: `width 650ms var(--ease-spring) ${i * 60}ms`,
                }}
              />
            </span>
            <span className="w-6 shrink-0 text-right text-xs font-semibold text-foreground">{b.count}</span>
          </button>
          {openId === b.projectId && (
            <div className="mt-1 ml-28 flex animate-fade-in-up flex-col gap-1 rounded-lg border border-border bg-muted/30 p-2">
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
          )}
        </div>
      ))}
    </div>
  )
}
