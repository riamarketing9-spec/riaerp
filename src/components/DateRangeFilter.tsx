import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

// Compact from/to date pair, no stacked label -- sized to sit inline in the
// same row as Combobox/Select filters (all h-9) instead of its own row.
export function DateRangeFilter({
  from,
  to,
  onFromChange,
  onToChange,
}: {
  from: string
  to: string
  onFromChange: (v: string) => void
  onToChange: (v: string) => void
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Input type="date" className="w-36" value={from} onChange={(e) => onFromChange(e.target.value)} />
      <span className="text-xs text-muted-foreground">–</span>
      <Input type="date" className="w-36" value={to} onChange={(e) => onToChange(e.target.value)} />
      {(from || to) && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => {
            onFromChange('')
            onToChange('')
          }}
        >
          <X className="size-3.5" />
        </Button>
      )}
    </div>
  )
}
