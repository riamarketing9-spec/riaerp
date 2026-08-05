import { Badge } from '@/components/ui/badge'
import { formatLocalDate } from '@/lib/localizedLabel'
import type { computeMonthlyProgress } from '@/lib/projectMonthlyProgress'
import { useTranslation } from 'react-i18next'

export type MonthlyProgressDetail = NonNullable<ReturnType<typeof computeMonthlyProgress>>

// Flexible per-work-type breakdown of exactly what counted toward this
// month's goal % -- one section per target row (whatever work types the
// CEO/PM picked for that project's goal), each showing date/title/status
// per card. Shared between the project card's progress-bar drill-down and
// the KPI-reports project tab so both always agree with each other and
// with the % itself.
export function MonthlyProgressBreakdown({
  detail,
  publishedStatusLabel,
}: {
  detail: MonthlyProgressDetail | null
  publishedStatusLabel: string
}) {
  const { t, i18n } = useTranslation()
  if (!detail) return null
  return (
    <div className="flex flex-col gap-4">
      {detail.perType.map((f) => (
        <div key={f.deliverable_type_id} className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-sm font-medium">
            <span>{f.label}</span>
            <span className="text-muted-foreground">
              {f.items.length} / {f.target}
            </span>
          </div>
          {f.items.length === 0 && <p className="text-xs text-muted-foreground">{t('projects.progressDetailEmpty')}</p>}
          {f.items.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2 py-1.5 text-xs">
              <span className="text-muted-foreground">{formatLocalDate(item.publish_date, i18n.language)}</span>
              <span className="flex-1 truncate">{item.topic}</span>
              <Badge variant="secondary" className="shrink-0 text-[10px]">
                {publishedStatusLabel}
              </Badge>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
