import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { formatLocalDate } from '@/lib/localizedLabel'
import type { computeMonthlyProgress } from '@/lib/projectMonthlyProgress'

export type MonthlyProgressDetail = NonNullable<ReturnType<typeof computeMonthlyProgress>>

function Section({
  label,
  target,
  statusLabel,
  emptyLabel,
  items,
}: {
  label: string
  target: number
  statusLabel: string
  emptyLabel: string
  items: { id: string; topic: string; publish_date: string | null }[]
}) {
  const { i18n } = useTranslation()
  if (target === 0) return null
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-sm font-medium">
        <span>{label}</span>
        <span className="text-muted-foreground">
          {items.length} / {target}
        </span>
      </div>
      {items.length === 0 && <p className="text-xs text-muted-foreground">{emptyLabel}</p>}
      {items.map((item) => (
        <div key={item.id} className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2 py-1.5 text-xs">
          <span className="text-muted-foreground">{formatLocalDate(item.publish_date, i18n.language)}</span>
          <span className="flex-1 truncate">{item.topic}</span>
          <Badge variant="secondary" className="shrink-0 text-[10px]">
            {statusLabel}
          </Badge>
        </div>
      ))}
    </div>
  )
}

// Flexible per-category breakdown of exactly what counted toward this
// month's goal % -- only categories with a nonzero target render at all
// (a project with no story target shouldn't show an empty "Stories: 0/0"
// row), each showing date/title/status per card. Shared between the
// project card's progress-bar drill-down and the KPI-reports project tab
// so both always agree with each other and with the % itself.
export function MonthlyProgressBreakdown({
  detail,
  publishedStatusLabel,
  doneStatusLabel,
}: {
  detail: MonthlyProgressDetail | null
  publishedStatusLabel: string
  doneStatusLabel: string
}) {
  const { t, i18n } = useTranslation()
  if (!detail) return null
  return (
    <div className="flex flex-col gap-4">
      <Section
        label={t('kpi.monthPosts')}
        target={detail.goal.target_posts}
        statusLabel={publishedStatusLabel}
        emptyLabel={t('projects.progressDetailEmpty')}
        items={detail.postsItems}
      />
      <Section
        label={t('kpi.monthStories')}
        target={detail.goal.target_stories}
        statusLabel={publishedStatusLabel}
        emptyLabel={t('projects.progressDetailEmpty')}
        items={detail.storiesItems}
      />
      {detail.goal.target_ads && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-sm font-medium">
            <span>{t('kpi.monthTarget')}</span>
            <span className="text-muted-foreground">{detail.targetTasks.length > 0 ? t('common.yes') : t('common.no')}</span>
          </div>
          {detail.targetTasks.length === 0 && (
            <p className="text-xs text-muted-foreground">{t('projects.progressDetailEmpty')}</p>
          )}
          {detail.targetTasks.map((tsk) => (
            <div key={tsk.id} className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2 py-1.5 text-xs">
              <span className="text-muted-foreground">{formatLocalDate(tsk.completed_at, i18n.language)}</span>
              <span className="flex-1 truncate">{tsk.title}</span>
              <Badge variant="secondary" className="shrink-0 text-[10px]">
                {doneStatusLabel}
              </Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
