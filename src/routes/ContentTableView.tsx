import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Combobox } from '@/components/ui/combobox'
import { DateRangeFilter } from '@/components/DateRangeFilter'
import { pickLabel, formatLocalDate } from '@/lib/localizedLabel'
import { cn, normalizeUrl } from '@/lib/utils'
import { ExternalLink } from 'lucide-react'

type ContentItem = {
  id: string
  topic: string
  project_id: string
  status_id: string
  format_id?: string | null
  rubric_id?: string | null
  video_goal?: string | null
  reference_url?: string | null
  publish_date: string | null
}

type Lookup = { id: string; slug?: string; label_ru: string; label_uz: string }

// Same per-status colors as the calendar card view — the status pill is the
// one place color carries meaning, everything else in the table stays plain.
const STATUS_BADGE_COLORS: Record<string, string> = {
  plan: 'bg-slate-100 text-slate-700 dark:bg-slate-800/60 dark:text-slate-300',
  script: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  shoot: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  edit: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  ready: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300',
  published: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
}

// Notion's "All table" view — one flat spreadsheet across every project,
// the counterpart to the calendar's card view (same data, same filters).
export function ContentTableView({
  items,
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  projects,
  statuses,
  itemPlatforms,
  platforms,
  contentFormats,
  contentRubrics,
  onOpen,
}: {
  items: ContentItem[]
  dateFrom?: string
  dateTo?: string
  onDateFromChange: (v: string) => void
  onDateToChange: (v: string) => void
  projects?: { id: string; name: string }[]
  statuses?: Lookup[]
  itemPlatforms?: { content_plan_item_id: string; platform_id: string }[]
  platforms?: Lookup[]
  contentFormats?: Lookup[]
  contentRubrics?: Lookup[]
  onOpen: (id: string) => void
}) {
  const { t, i18n } = useTranslation()
  const [projectFilter, setProjectFilter] = useState('')
  const [platformFilter, setPlatformFilter] = useState('')
  const [formatFilter, setFormatFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  // Platform/format only, no status/project narrowing beyond project itself
  // -- shared base for the table (adds statusFilter) and the per-status
  // stats strip (needs every status's count, so it can't be pre-narrowed).
  const itemsForStats = useMemo(() => {
    return items.filter((item) => {
      if (projectFilter && item.project_id !== projectFilter) return false
      if (formatFilter && item.format_id !== formatFilter) return false
      if (platformFilter) {
        const hasPlatform = (itemPlatforms ?? []).some(
          (ip) => ip.content_plan_item_id === item.id && ip.platform_id === platformFilter
        )
        if (!hasPlatform) return false
      }
      return true
    })
  }, [items, projectFilter, platformFilter, formatFilter, itemPlatforms])

  const filtered = useMemo(
    () => itemsForStats.filter((item) => !statusFilter || item.status_id === statusFilter),
    [itemsForStats, statusFilter]
  )

  // Only meaningful once a single project is selected -- a cross-project
  // breakdown mixed together isn't a useful number.
  const statusCounts = useMemo(() => {
    const map = new Map<string, number>()
    if (!projectFilter) return map
    for (const item of itemsForStats) map.set(item.status_id, (map.get(item.status_id) ?? 0) + 1)
    return map
  }, [itemsForStats, projectFilter])

  const projectName = (id: string) => projects?.find((p) => p.id === id)?.name ?? '—'
  const statusLabel = (id: string) => pickLabel(statuses?.find((s) => s.id === id), i18n.language) ?? '—'
  const statusSlug = (id: string) => statuses?.find((s) => s.id === id)?.slug
  const formatLabel = (id?: string | null) => (id ? pickLabel(contentFormats?.find((f) => f.id === id), i18n.language) : null)
  const rubricLabel = (id?: string | null) => (id ? pickLabel(contentRubrics?.find((r) => r.id === id), i18n.language) : null)
  const platformsFor = (itemId: string) =>
    (itemPlatforms ?? [])
      .filter((ip) => ip.content_plan_item_id === itemId)
      .map((ip) => pickLabel(platforms?.find((p) => p.id === ip.platform_id), i18n.language))
      .filter((l): l is string => !!l)

  return (
    <div className="flex flex-col gap-4">
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
        <Combobox
          className="w-40"
          options={(statuses ?? []).map((s) => ({ value: s.id, label: pickLabel(s, i18n.language) ?? '' }))}
          value={statusFilter}
          onChange={setStatusFilter}
          placeholder={t('contentPlan.allStatuses')}
        />
        <DateRangeFilter from={dateFrom ?? ''} to={dateTo ?? ''} onFromChange={onDateFromChange} onToChange={onDateToChange} />
      </div>

      {projectFilter && (
        <div className="flex flex-wrap gap-2">
          {statuses?.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setStatusFilter(statusFilter === s.id ? '' : s.id)}
              className={cn(
                'flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                statusFilter === s.id
                  ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200'
                  : 'border-border text-muted-foreground hover:bg-muted'
              )}
            >
              {pickLabel(s, i18n.language)}
              <Badge variant="secondary" className="text-[10px]">
                {statusCounts.get(s.id) ?? 0}
              </Badge>
            </button>
          ))}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('contentPlan.topic')}</TableHead>
              <TableHead>{t('projects.title')}</TableHead>
              <TableHead>{t('contentPlan.status')}</TableHead>
              <TableHead>{t('contentPlan.format')}</TableHead>
              <TableHead>{t('contentPlan.publishDate')}</TableHead>
              <TableHead>{t('contentPlan.platforms')}</TableHead>
              <TableHead>{t('contentPlan.rubric')}</TableHead>
              <TableHead>{t('contentPlan.videoGoal')}</TableHead>
              <TableHead>{t('contentPlan.referenceUrl')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground">
                  {t('contentPlan.empty')}
                </TableCell>
              </TableRow>
            )}
            {filtered.map((item) => (
              <TableRow key={item.id} className="cursor-pointer" onClick={() => onOpen(item.id)}>
                <TableCell className="font-medium">{item.topic}</TableCell>
                <TableCell className="text-muted-foreground">{projectName(item.project_id)}</TableCell>
                <TableCell>
                  <Badge
                    variant="secondary"
                    className={cn(statusSlug(item.status_id) && STATUS_BADGE_COLORS[statusSlug(item.status_id)!])}
                  >
                    {statusLabel(item.status_id)}
                  </Badge>
                </TableCell>
                <TableCell>{formatLabel(item.format_id) ?? '—'}</TableCell>
                <TableCell>{formatLocalDate(item.publish_date, i18n.language)}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {platformsFor(item.id).map((label) => (
                      <Badge key={label} variant="outline" className="text-[11px]">
                        {label}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  {rubricLabel(item.rubric_id) ? (
                    <Badge variant="secondary">{rubricLabel(item.rubric_id)}</Badge>
                  ) : (
                    '—'
                  )}
                </TableCell>
                <TableCell className="max-w-48 truncate text-muted-foreground">{item.video_goal || '—'}</TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  {item.reference_url ? (
                    <a
                      href={normalizeUrl(item.reference_url)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      <ExternalLink className="size-3.5" />
                    </a>
                  ) : (
                    '—'
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
