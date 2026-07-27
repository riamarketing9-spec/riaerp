import { useState } from 'react'

export type ProjectTaskBar = {
  projectId: string
  projectName: string
  count: number
  tasks: { id: string; title: string; deadline: string | null }[]
}

// Horizontal bar list, one hue -- each bar is directly labeled with the
// project name, so categorical distinctness between bars isn't needed here.
const BAR_COLOR = '#1baf7a'

export function ProjectTasksChart({ bars }: { bars: ProjectTaskBar[] }) {
  const [openId, setOpenId] = useState<string | null>(null)
  const max = Math.max(1, ...bars.map((b) => b.count))

  if (bars.length === 0) return null

  return (
    <div className="flex flex-col gap-2">
      {bars.map((b) => (
        <div key={b.projectId}>
          <button
            type="button"
            className="flex w-full items-center gap-2 text-left"
            onClick={() => setOpenId((id) => (id === b.projectId ? null : b.projectId))}
            aria-expanded={openId === b.projectId}
          >
            <span className="w-28 shrink-0 truncate text-xs text-foreground">{b.projectName}</span>
            <span className="h-4 flex-1 overflow-hidden rounded bg-muted">
              <span
                className="block h-full rounded"
                style={{ width: `${(b.count / max) * 100}%`, background: BAR_COLOR }}
              />
            </span>
            <span className="w-6 shrink-0 text-right text-xs font-medium text-foreground">{b.count}</span>
          </button>
          {openId === b.projectId && (
            <div className="mt-1 ml-28 flex flex-col gap-1 rounded-md border border-border p-2">
              {b.tasks.length === 0 ? (
                <p className="px-1 text-xs text-muted-foreground">—</p>
              ) : (
                b.tasks.map((task) => (
                  <div key={task.id} className="flex items-center justify-between gap-2 px-1 text-xs">
                    <span className="truncate font-medium">{task.title}</span>
                    <span className="shrink-0 text-muted-foreground">
                      {task.deadline ? new Date(task.deadline).toLocaleDateString() : '—'}
                    </span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
