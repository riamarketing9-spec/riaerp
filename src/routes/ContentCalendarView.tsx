import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns'
import { ru, uz } from 'date-fns/locale'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { pickLabel } from '@/lib/localizedLabel'
import { cn } from '@/lib/utils'
import { ChevronLeft, ChevronRight } from 'lucide-react'

type ContentItem = {
  id: string
  topic: string
  project_id: string
  status_id: string
  publish_date: string | null
}

export function ContentCalendarView({
  items,
  statuses,
  itemPlatforms,
  platforms,
  onOpen,
}: {
  items: ContentItem[]
  statuses?: { id: string; label_ru: string; label_uz: string }[]
  itemPlatforms?: { content_plan_item_id: string; platform_id: string }[]
  platforms?: { id: string; label_ru: string; label_uz: string }[]
  onOpen: (id: string) => void
}) {
  const { t, i18n } = useTranslation()
  const [month, setMonth] = useState(() => new Date())
  const locale = i18n.language.startsWith('uz') ? uz : ru

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn: 0 })
    const end = endOfWeek(endOfMonth(month), { weekStartsOn: 0 })
    return eachDayOfInterval({ start, end })
  }, [month])

  const itemsByDate = useMemo(() => {
    const map = new Map<string, ContentItem[]>()
    for (const item of items) {
      if (!item.publish_date) continue
      const list = map.get(item.publish_date) ?? []
      list.push(item)
      map.set(item.publish_date, list)
    }
    return map
  }, [items])

  const statusLabel = (id: string) => pickLabel(statuses?.find((s) => s.id === id), i18n.language)
  const platformsFor = (itemId: string) =>
    (itemPlatforms ?? [])
      .filter((ip) => ip.content_plan_item_id === itemId)
      .map((ip) => pickLabel(platforms?.find((p) => p.id === ip.platform_id), i18n.language))
      .filter(Boolean)

  const weekDayLabels = useMemo(() => {
    const start = startOfWeek(new Date(), { weekStartsOn: 0 })
    return eachDayOfInterval({ start, end: endOfWeek(start, { weekStartsOn: 0 }) }).map((d) =>
      format(d, 'EEEEEE', { locale })
    )
  }, [locale])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold capitalize">{format(month, 'LLLL yyyy', { locale })}</h2>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" onClick={() => setMonth((m) => subMonths(m, 1))}>
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setMonth(new Date())}>
            {t('contentPlan.today')}
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => setMonth((m) => addMonths(m, 1))}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-border bg-border text-xs">
        {weekDayLabels.map((label) => (
          <div key={label} className="bg-muted/60 py-1.5 text-center font-medium text-muted-foreground">
            {label}
          </div>
        ))}
        {days.map((day) => {
          const key = format(day, 'yyyy-MM-dd')
          const dayItems = itemsByDate.get(key) ?? []
          return (
            <div
              key={key}
              className={cn(
                'flex min-h-28 flex-col gap-1 bg-card p-1.5',
                !isSameMonth(day, month) && 'bg-muted/30 text-muted-foreground'
              )}
            >
              <span
                className={cn(
                  'w-fit rounded-full px-1.5 text-[11px]',
                  isToday(day) && 'bg-brand-500 font-semibold text-white'
                )}
              >
                {format(day, 'd')}
              </span>
              <div className="flex flex-col gap-1 overflow-y-auto">
                {dayItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onOpen(item.id)}
                    className="flex flex-col gap-0.5 rounded-md bg-muted/60 px-1.5 py-1 text-left hover:bg-accent"
                  >
                    <span className="truncate text-[11px] font-medium">{item.topic}</span>
                    <div className="flex flex-wrap gap-0.5">
                      <Badge variant="secondary" className="px-1 py-0 text-[9px]">
                        {statusLabel(item.status_id)}
                      </Badge>
                      {platformsFor(item.id).map((label) => (
                        <Badge key={label} variant="outline" className="px-1 py-0 text-[9px]">
                          {label}
                        </Badge>
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
