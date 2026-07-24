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
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Combobox } from '@/components/ui/combobox'
import { pickLabel } from '@/lib/localizedLabel'
import { cn } from '@/lib/utils'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'

type ContentItem = {
  id: string
  topic: string
  project_id: string
  status_id: string
  format_id?: string | null
  publish_date: string | null
}

type ProjectLookup = { id: string; name: string; logo_url?: string | null }
type StatusLookup = { id: string; slug: string; label_ru: string; label_uz: string }
type FormatLookup = { id: string; slug: string; label_ru: string; label_uz: string }

// 6 fixed content_statuses (plan/script/shoot/edit/ready/published) — one
// color per stage, applied only to the status pill so the card itself stays
// white/neutral (the client explicitly wants cards white, status colored).
const STATUS_BADGE_COLORS: Record<string, string> = {
  plan: 'bg-slate-100 text-slate-700 dark:bg-slate-800/60 dark:text-slate-300',
  script: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  shoot: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  edit: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  ready: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300',
  published: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
}

// Deterministic color per project so cards are visually distinguishable by
// project even before anyone bothers uploading a real logo.
const PROJECT_DOT_COLORS = [
  'bg-rose-500', 'bg-orange-500', 'bg-amber-500', 'bg-lime-500',
  'bg-emerald-500', 'bg-teal-500', 'bg-cyan-500', 'bg-blue-500',
  'bg-violet-500', 'bg-fuchsia-500',
]
function projectColorFor(projectId: string) {
  let hash = 0
  for (let i = 0; i < projectId.length; i++) hash = (hash * 31 + projectId.charCodeAt(i)) >>> 0
  return PROJECT_DOT_COLORS[hash % PROJECT_DOT_COLORS.length]
}

function CalendarItemCard({
  item,
  statusSlug,
  statusLabel,
  platformLabels,
  logoUrl,
  projectName,
  onOpen,
  dragging,
}: {
  item: ContentItem
  statusSlug?: string
  statusLabel?: string
  platformLabels: string[]
  logoUrl?: string | null
  projectName?: string
  onOpen: () => void
  dragging?: boolean
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onOpen()
      }}
      className={cn(
        'flex flex-col gap-1.5 rounded-lg border border-border bg-card px-3 py-2.5 text-left shadow-xs hover:bg-accent/40',
        dragging && 'opacity-40'
      )}
    >
      <div className="flex items-center gap-2">
        {logoUrl ? (
          <img src={logoUrl} alt="" className="size-5 shrink-0 rounded-full object-cover" />
        ) : (
          <span
            title={projectName}
            className={cn(
              'flex size-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white',
              projectColorFor(item.project_id)
            )}
          >
            {projectName?.[0]?.toUpperCase()}
          </span>
        )}
        <span className="truncate text-sm font-medium">{item.topic}</span>
      </div>
      <div className="flex flex-wrap gap-1">
        <Badge
          variant="secondary"
          className={cn('px-2 py-0.5 text-[11px]', statusSlug && STATUS_BADGE_COLORS[statusSlug])}
        >
          {statusLabel}
        </Badge>
        {platformLabels.map((label) => (
          <Badge key={label} variant="outline" className="px-2 py-0.5 text-[11px]">
            {label}
          </Badge>
        ))}
      </div>
    </button>
  )
}

function DraggableItemCard(props: Parameters<typeof CalendarItemCard>[0]) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: props.item.id })
  return (
    <div ref={setNodeRef} {...listeners} {...attributes}>
      <CalendarItemCard {...props} dragging={isDragging} />
    </div>
  )
}

function DroppableDayCell({
  dateKey,
  children,
  onClick,
  className,
}: {
  dateKey: string
  children: React.ReactNode
  onClick: () => void
  className?: string
}) {
  const { setNodeRef, isOver } = useDroppable({ id: dateKey })
  return (
    <div
      ref={setNodeRef}
      onClick={onClick}
      className={cn('group/day flex min-h-52 cursor-pointer flex-col gap-2 bg-card p-3', isOver && 'ring-2 ring-inset ring-brand-400', className)}
    >
      {children}
    </div>
  )
}

export function ContentCalendarView({
  items,
  projects,
  statuses,
  itemPlatforms,
  platforms,
  contentFormats,
  onOpen,
  onCreate,
  onMove,
}: {
  items: ContentItem[]
  projects?: ProjectLookup[]
  statuses?: StatusLookup[]
  itemPlatforms?: { content_plan_item_id: string; platform_id: string }[]
  platforms?: { id: string; label_ru: string; label_uz: string }[]
  contentFormats?: FormatLookup[]
  onOpen: (id: string) => void
  onCreate: (publishDate: string) => void
  onMove: (itemId: string, newDate: string) => void
}) {
  const { t, i18n } = useTranslation()
  const [month, setMonth] = useState(() => new Date())
  const [projectFilter, setProjectFilter] = useState('')
  const [platformFilter, setPlatformFilter] = useState('')
  const [formatFilter, setFormatFilter] = useState('')
  const [activeItem, setActiveItem] = useState<ContentItem | null>(null)
  const locale = i18n.language.startsWith('uz') ? uz : ru
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 })
    const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 })
    return eachDayOfInterval({ start, end })
  }, [month])

  const itemsByDate = useMemo(() => {
    const map = new Map<string, ContentItem[]>()
    for (const item of items) {
      if (!item.publish_date) continue
      if (projectFilter && item.project_id !== projectFilter) continue
      if (formatFilter && item.format_id !== formatFilter) continue
      if (platformFilter) {
        const hasPlatform = (itemPlatforms ?? []).some(
          (ip) => ip.content_plan_item_id === item.id && ip.platform_id === platformFilter
        )
        if (!hasPlatform) continue
      }
      const list = map.get(item.publish_date) ?? []
      list.push(item)
      map.set(item.publish_date, list)
    }
    return map
  }, [items, projectFilter, platformFilter, formatFilter, itemPlatforms])

  const statusOf = (id: string) => statuses?.find((s) => s.id === id)
  const statusLabel = (id: string) => pickLabel(statusOf(id), i18n.language)
  const platformsFor = (itemId: string) =>
    (itemPlatforms ?? [])
      .filter((ip) => ip.content_plan_item_id === itemId)
      .map((ip) => pickLabel(platforms?.find((p) => p.id === ip.platform_id), i18n.language))
      .filter((l): l is string => !!l)
  const logoFor = (projectId: string) => projects?.find((p) => p.id === projectId)?.logo_url
  const projectNameFor = (projectId: string) => projects?.find((p) => p.id === projectId)?.name

  const weekDayLabels = useMemo(() => {
    const start = startOfWeek(new Date(), { weekStartsOn: 1 })
    return eachDayOfInterval({ start, end: endOfWeek(start, { weekStartsOn: 1 }) }).map((d) =>
      format(d, 'EEEEEE', { locale })
    )
  }, [locale])

  function handleDragStart(event: DragStartEvent) {
    const item = items.find((i) => i.id === event.active.id)
    setActiveItem(item ?? null)
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveItem(null)
    const { active, over } = event
    if (!over) return
    const newDate = String(over.id)
    const item = items.find((i) => i.id === active.id)
    if (item && item.publish_date !== newDate) {
      onMove(item.id, newDate)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Combobox
            className="w-44"
            options={(projects ?? []).map((p) => ({ value: p.id, label: p.name }))}
            value={projectFilter}
            onChange={setProjectFilter}
            placeholder={t('contentPlan.allProjects')}
          />
          <Combobox
            className="w-40"
            options={(platforms ?? []).map((p) => ({ value: p.id, label: pickLabel(p, i18n.language) ?? '' }))}
            value={platformFilter}
            onChange={setPlatformFilter}
            placeholder={t('contentPlan.allPlatforms')}
          />
          <Combobox
            className="w-40"
            options={(contentFormats ?? []).map((f) => ({ value: f.id, label: pickLabel(f, i18n.language) ?? '' }))}
            value={formatFilter}
            onChange={setFormatFilter}
            placeholder={t('contentPlan.allFormats')}
          />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon-sm" onClick={() => setMonth((m) => subMonths(m, 1))}>
            <ChevronLeft className="size-4" />
          </Button>
          <h2 className="w-40 text-center text-base font-semibold capitalize">
            {format(month, 'LLLL yyyy', { locale })}
          </h2>
          <Button variant="ghost" size="icon-sm" onClick={() => setMonth((m) => addMonths(m, 1))}>
            <ChevronRight className="size-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setMonth(new Date())}>
            {t('contentPlan.today')}
          </Button>
        </div>
      </div>

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-7 overflow-hidden rounded-lg border border-border [&>*]:border-b [&>*]:border-r [&>*:nth-child(7n)]:border-r-0">
          {weekDayLabels.map((label) => (
            <div key={label} className="bg-muted/40 py-3 text-center text-sm font-medium text-muted-foreground">
              {label}
            </div>
          ))}
          {days.map((day) => {
            const key = format(day, 'yyyy-MM-dd')
            const dayItems = itemsByDate.get(key) ?? []
            return (
              <DroppableDayCell
                key={key}
                dateKey={key}
                onClick={() => onCreate(key)}
                className={cn(!isSameMonth(day, month) && 'bg-muted/20 text-muted-foreground')}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      'flex size-7 w-fit items-center justify-center rounded-full px-2 text-sm',
                      isToday(day) && 'bg-primary font-semibold text-primary-foreground'
                    )}
                  >
                    {format(day, 'd')}
                  </span>
                  <Plus className="size-3.5 text-muted-foreground opacity-0 group-hover/day:opacity-100" />
                </div>
                <div className="flex flex-1 flex-col gap-1.5 overflow-y-auto">
                  {dayItems.map((item) => (
                    <DraggableItemCard
                      key={item.id}
                      item={item}
                      statusSlug={statusOf(item.status_id)?.slug}
                      statusLabel={statusLabel(item.status_id)}
                      platformLabels={platformsFor(item.id)}
                      logoUrl={logoFor(item.project_id)}
                      projectName={projectNameFor(item.project_id)}
                      onOpen={() => onOpen(item.id)}
                    />
                  ))}
                </div>
              </DroppableDayCell>
            )
          })}
        </div>
        <DragOverlay>
          {activeItem && (
            <CalendarItemCard
              item={activeItem}
              statusSlug={statusOf(activeItem.status_id)?.slug}
              statusLabel={statusLabel(activeItem.status_id)}
              platformLabels={platformsFor(activeItem.id)}
              logoUrl={logoFor(activeItem.project_id)}
              projectName={projectNameFor(activeItem.project_id)}
              onOpen={() => {}}
            />
          )}
        </DragOverlay>
      </DndContext>
    </div>
  )
}
