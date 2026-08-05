import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'

// Deliberately minimal, distinct from TaskCard -- a chek-list item is "a
// bit different" per the CEO: no project/deadline/status/work-type/
// calendar fields, completion is a direct checkbox (no need to open the
// card), just the title, recurrence, and who it's for.
export function ChecklistTaskCard({
  title,
  isDone,
  recurrenceLabel,
  assigneeName,
  onToggleDone,
  onOpen,
}: {
  title: string
  isDone: boolean
  recurrenceLabel?: string
  assigneeName?: string
  onToggleDone: (done: boolean) => void
  onOpen: () => void
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5 shadow-sm">
      <Checkbox checked={isDone} onCheckedChange={(checked) => onToggleDone(checked === true)} />
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          'flex-1 truncate text-left text-sm font-medium hover:underline',
          isDone && 'text-muted-foreground line-through'
        )}
      >
        {title}
      </button>
      {recurrenceLabel && (
        <Badge variant="outline" className="shrink-0 text-[10px]">
          {recurrenceLabel}
        </Badge>
      )}
      {assigneeName && <span className="shrink-0 text-xs text-muted-foreground">{assigneeName}</span>}
    </div>
  )
}
