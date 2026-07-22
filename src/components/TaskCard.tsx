import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Pencil, Trash2 } from 'lucide-react'
import { formatLocalDateTime } from '@/lib/localizedLabel'
import { cn } from '@/lib/utils'

function InitialsChip({ name }: { name: string }) {
  const initials = name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
  return (
    <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-500 text-[10px] font-semibold text-white">
      {initials}
    </div>
  )
}

export type TaskCardSubtask = { id: string; title: string; is_done: boolean }

export function TaskCard({
  title,
  statusLabel,
  statusSlug,
  deliverableTypeLabels,
  termLabel,
  quadrantLabel,
  deadline,
  percentComplete,
  assigneeName,
  subtasks,
  createdViaBot,
  onOpen,
  onDelete,
  className,
}: {
  title: string
  statusLabel?: string
  statusSlug?: string
  deliverableTypeLabels?: string[]
  termLabel?: string
  quadrantLabel?: string
  deadline: string | null
  percentComplete: number
  assigneeName?: string
  subtasks?: TaskCardSubtask[]
  createdViaBot?: boolean
  onOpen: () => void
  onDelete?: () => void
  className?: string
}) {
  const { i18n } = useTranslation()

  const isDone = statusSlug === 'done'
  const overdue = !!deadline && new Date(deadline) < new Date() && !isDone
  const dueSoon =
    !!deadline && !overdue && !isDone && new Date(deadline).getTime() - Date.now() <= 3 * 24 * 60 * 60 * 1000

  // Color follows the task's actual status, not just subtask %: a task
  // manually moved to "Готово/Tayyor" must read as done immediately, even
  // if nobody bothered to check off its subtasks.
  const barColor = isDone
    ? 'bg-emerald-500'
    : percentComplete >= 100
      ? 'bg-emerald-500'
      : percentComplete > 0
        ? 'bg-brand-500'
        : 'bg-muted-foreground/30'

  const visibleSubtasks = (subtasks ?? []).slice(0, 4)
  const remainingCount = (subtasks ?? []).length - visibleSubtasks.length

  return (
    <div
      className={cn(
        'flex flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm',
        className
      )}
    >
      <div className="h-1.5 w-full bg-muted">
        <div className={cn('h-full transition-all', barColor)} style={{ width: `${isDone ? 100 : percentComplete}%` }} />
      </div>

      <div className="flex flex-col gap-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <button type="button" onClick={onOpen} className="flex-1 text-left text-sm font-medium hover:underline">
            {createdViaBot && <span title="Telegram bot orqali yaratilgan">🤖 </span>}
            {title}
          </button>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={onOpen}
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Pencil className="size-3.5" />
            </button>
            {onDelete && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete()
                }}
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
              >
                <Trash2 className="size-3.5" />
              </button>
            )}
          </div>
        </div>

        {(statusLabel || termLabel || quadrantLabel || (deliverableTypeLabels?.length ?? 0) > 0) && (
          <div className="flex flex-wrap gap-1">
            {statusLabel && (
              <Badge
                variant="secondary"
                className={cn(
                  'text-[10px]',
                  isDone && 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                )}
              >
                {statusLabel}
              </Badge>
            )}
            {termLabel && (
              <Badge variant="outline" className="text-[10px]">
                {termLabel}
              </Badge>
            )}
            {quadrantLabel && (
              <Badge variant="default" className="text-[10px]">
                {quadrantLabel}
              </Badge>
            )}
            {deliverableTypeLabels?.map((label) => (
              <Badge key={label} variant="outline" className="text-[10px]">
                {label}
              </Badge>
            ))}
          </div>
        )}

        {visibleSubtasks.length > 0 && (
          <div className="flex flex-col gap-1 rounded-md bg-muted/30 p-2">
            {visibleSubtasks.map((st) => (
              <div key={st.id} className="flex items-center gap-1.5">
                <Checkbox checked={st.is_done} disabled className="size-3.5" />
                <span className={cn('text-xs', st.is_done && 'text-muted-foreground line-through')}>
                  {st.title}
                </span>
              </div>
            ))}
            {remainingCount > 0 && (
              <p className="text-[10px] text-muted-foreground">+{remainingCount}</p>
            )}
          </div>
        )}

        <div className="flex items-center justify-between gap-2 pt-1">
          {deadline ? (
            <Badge variant={overdue ? 'destructive' : dueSoon ? 'secondary' : 'outline'} className="text-[10px]">
              {formatLocalDateTime(deadline, i18n.language)}
            </Badge>
          ) : (
            <span />
          )}
          {assigneeName && (
            <div className="flex items-center gap-1.5">
              <InitialsChip name={assigneeName} />
              <span className="truncate text-xs text-muted-foreground">{assigneeName}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
