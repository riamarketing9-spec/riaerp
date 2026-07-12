import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabaseClient'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ContentItemSheet } from './ContentItemSheet'
import { pickLabel, formatLocalDate } from '@/lib/localizedLabel'
import { Plus } from 'lucide-react'

export function ContentPlanPage() {
  const { t, i18n } = useTranslation()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [projectFilter, setProjectFilter] = useState<string>('')
  const [platformFilter, setPlatformFilter] = useState<string>('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const { data: items, isLoading } = useQuery({
    queryKey: ['content_plan_items'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('content_plan_items')
        .select('id, topic, project_id, status_id, shoot_date, publish_date')
        .order('publish_date', { ascending: true, nullsFirst: false })
      if (error) throw error
      return data
    },
  })

  const { data: itemPlatforms } = useQuery({
    queryKey: ['content_plan_platforms-all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('content_plan_platforms')
        .select('content_plan_item_id, platform_id')
      if (error) throw error
      return data
    },
  })

  const { data: projects } = useQuery({
    queryKey: ['projects-lookup'],
    queryFn: async () => {
      const { data, error } = await supabase.from('projects').select('id, name')
      if (error) throw error
      return data
    },
  })

  const { data: statuses } = useQuery({
    queryKey: ['content_statuses'],
    queryFn: async () => {
      const { data, error } = await supabase.from('content_statuses').select('id, label_ru, label_uz')
      if (error) throw error
      return data
    },
  })

  const { data: platforms } = useQuery({
    queryKey: ['platforms'],
    queryFn: async () => {
      const { data, error } = await supabase.from('platforms').select('id, label_ru, label_uz')
      if (error) throw error
      return data
    },
  })

  const projectName = (id: string) => projects?.find((p) => p.id === id)?.name ?? '—'
  const statusLabel = (id: string) =>
    pickLabel(statuses?.find((s) => s.id === id), i18n.language) ?? '—'
  const platformsFor = (itemId: string) =>
    (itemPlatforms ?? [])
      .filter((ip) => ip.content_plan_item_id === itemId)
      .map((ip) => pickLabel(platforms?.find((p) => p.id === ip.platform_id), i18n.language))
      .filter(Boolean)

  const filtered = useMemo(() => {
    return (items ?? []).filter((item) => {
      if (projectFilter && item.project_id !== projectFilter) return false
      if (platformFilter) {
        const ids = (itemPlatforms ?? [])
          .filter((ip) => ip.content_plan_item_id === item.id)
          .map((ip) => ip.platform_id)
        if (!ids.includes(platformFilter)) return false
      }
      if (dateFrom && (!item.publish_date || item.publish_date < dateFrom)) return false
      if (dateTo && (!item.publish_date || item.publish_date > dateTo)) return false
      return true
    })
  }, [items, itemPlatforms, projectFilter, platformFilter, dateFrom, dateTo])

  function openCreate() {
    setEditingId(null)
    setSheetOpen(true)
  }

  function openEdit(id: string) {
    setEditingId(id)
    setSheetOpen(true)
  }

  const hasFilters = projectFilter || platformFilter || dateFrom || dateTo

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{t('contentPlan.title')}</h1>
        <Button onClick={openCreate}>
          <Plus />
          {t('contentPlan.newItem')}
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border p-3">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-muted-foreground">{t('contentPlan.project')}</span>
          <Select value={projectFilter} onValueChange={(v: string | null) => setProjectFilter(v ?? '')}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder={t('contentPlan.allProjects')}>
                {() => projects?.find((p) => p.id === projectFilter)?.name}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {projects?.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-muted-foreground">{t('contentPlan.platforms')}</span>
          <Select value={platformFilter} onValueChange={(v: string | null) => setPlatformFilter(v ?? '')}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder={t('contentPlan.allPlatforms')}>
                {() => pickLabel(platforms?.find((p) => p.id === platformFilter), i18n.language)}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {platforms?.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {pickLabel(p, i18n.language)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-muted-foreground">{t('contentPlan.dateFrom')}</span>
          <Input type="date" className="w-40" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-muted-foreground">{t('contentPlan.dateTo')}</span>
          <Input type="date" className="w-40" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setProjectFilter('')
              setPlatformFilter('')
              setDateFrom('')
              setDateTo('')
            }}
          >
            {t('contentPlan.resetFilters')}
          </Button>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('contentPlan.topic')}</TableHead>
              <TableHead>{t('contentPlan.project')}</TableHead>
              <TableHead>{t('contentPlan.platforms')}</TableHead>
              <TableHead>{t('contentPlan.status')}</TableHead>
              <TableHead>{t('contentPlan.shootDate')}</TableHead>
              <TableHead>{t('contentPlan.publishDate')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  {t('common.loading')}...
                </TableCell>
              </TableRow>
            )}
            {!isLoading && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  {t('contentPlan.empty')}
                </TableCell>
              </TableRow>
            )}
            {filtered.map((item) => (
              <TableRow
                key={item.id}
                className="cursor-pointer"
                onClick={() => openEdit(item.id)}
              >
                <TableCell className="font-medium">{item.topic}</TableCell>
                <TableCell>{projectName(item.project_id)}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {platformsFor(item.id).map((label) => (
                      <Badge key={label} variant="secondary" className="text-[10px]">
                        {label}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{statusLabel(item.status_id)}</Badge>
                </TableCell>
                <TableCell>{formatLocalDate(item.shoot_date, i18n.language)}</TableCell>
                <TableCell>{formatLocalDate(item.publish_date, i18n.language)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ContentItemSheet open={sheetOpen} onOpenChange={setSheetOpen} itemId={editingId} />
    </div>
  )
}
