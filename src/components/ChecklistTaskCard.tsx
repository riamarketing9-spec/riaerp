import { X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'

// Deliberately minimal, distinct from TaskCard -- a chek-list item is "a
// bit different" per the CEO: no project/deadline/status/work-type/
// calendar fields, completion is a direct checkbox (no need to open the
// card), just the title, recurrence, and who it's for. Deletion is the
// same story -- a direct X, not "open the card to find delete".
export function ChecklistTaskCard({
  title,
  isDone,
  recurrenceLabel,
  assigneeName,
  onToggleDone,
  onOpen,
  onDelete,
}: {
  title: string
  isDone: boolean
  recurrenceLabel?: string
  assigneeName?: string
  onToggleDone: (done: boolean) => void
  onOpen: () => void
  onDelete?: () => void
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-card px-3 py-2.5 shadow-sm">
      <div className="flex items-start gap-2">
        <Checkbox
          checked={isDone}
          onCheckedChange={(checked) => onToggleDone(checked === true)}
          className="mt-0.5 shrink-0"
        />
        <button
          type="button"
          onClick={onOpen}
          className={cn(
            'flex-1 text-left text-sm font-medium break-words hover:underline',
            isDone && 'text-muted-foreground line-through'
          )}
        >
          {title}
        </button>
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-destructive"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
      {(recurrenceLabel || assigneeName) && (
        <div className="flex flex-wrap items-center gap-1.5 pl-6">
          {recurrenceLabel && (
            <Badge variant="outline" className="shrink-0 text-[10px]">
              {recurrenceLabel}
            </Badge>
          )}
          {assigneeName && <span className="truncate text-xs text-muted-foreground">{assigneeName}</span>}
        </div>
      )}
    </div>
  )
}
