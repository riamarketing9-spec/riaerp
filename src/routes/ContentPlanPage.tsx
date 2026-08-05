import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabaseClient'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card, CardContent } from '@/components/ui/card'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ContentItemSheet } from './ContentItemSheet'
import { ContentCalendarView } from './ContentCalendarView'
import { ContentTableView } from './ContentTableView'
import { ProjectLogoSquare } from '@/components/ProjectLogoSquare'
import { DateRangeFilter } from '@/components/DateRangeFilter'
import { pickLabel, formatLocalDate } from '@/lib/localizedLabel'
import { cn } from '@/lib/utils'
import { ArrowLeft, Plus } from 'lucide-react'

export function ContentPlanPage() {
  const { t, i18n } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const view = ['folders', 'calendar', 'table'].includes(searchParams.get('view') ?? '')
    ? searchParams.get('view')!
    : 'folders'
  const selectedProjectId = searchParams.get('project')

  function setView(v: string) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.set('view', v)
        return next
      },
      { replace: true }
    )
  }

  function setSelectedProjectId(id: string | null) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (id) next.set('project', id)
        else next.delete('project')
        return next
      },
      { replace: true }
    )
  }

  const [sheetOpen, setSheetOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [createDate, setCreateDate] = useState<string | null>(null)
  const [folderSearch, setFolderSearch] = useState('')
  const [platformFilter, setPlatformFilter] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const { data: items, isLoading } = useQuery({
    queryKey: ['content_plan_items'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('content_plan_items')
        .select('id, topic, project_id, status_id, format_id, rubric_id, video_goal, reference_url, shoot_date, publish_date')
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
      const { data, error } = await supabase.from('projects').select('id, name, logo_url').order('name')
      if (error) throw error
      return data
    },
  })

  const { data: statuses } = useQuery({
    queryKey: ['content_statuses'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('content_statuses')
        .select('id, slug, label_ru, label_uz, sort_order')
        .order('sort_order')
      if (error) throw error
      return data
    },
  })

  const queryClient = useQueryClient()

  const moveMutation = useMutation({
    mutationFn: async ({ id, publish_date }: { id: string; publish_date: string }) => {
      const { error } = await supabase.from('content_plan_items').update({ publish_date }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['content_plan_items'] })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  function handleMove(itemId: string, newDate: string) {
    moveMutation.mutate({ id: itemId, publish_date: newDate })
  }

  const { data: platforms } = useQuery({
    queryKey: ['platforms'],
    queryFn: async () => {
      const { data, error } = await supabase.from('platforms').select('id, label_ru, label_uz')
      if (error) throw error
      return data
    },
  })

  const { data: contentFormats } = useQuery({
    queryKey: ['content_formats'],
    queryFn: async () => {
      const { data, error } = await supabase.from('content_formats').select('id, slug, label_ru, label_uz')
      if (error) throw error
      return data
    },
  })

  const { data: contentRubrics } = useQuery({
    queryKey: ['content_rubrics'],
    queryFn: async () => {
      const { data, error } = await supabase.from('content_rubrics').select('id, slug, label_ru, label_uz').order('sort_order')
      if (error) throw error
      return data
    },
  })

  const statusLabel = (id: string) =>
    pickLabel(statuses?.find((s) => s.id === id), i18n.language) ?? '—'
  const platformsFor = (itemId: string) =>
    (itemPlatforms ?? [])
      .filter((ip) => ip.content_plan_item_id === itemId)
      .map((ip) => pickLabel(platforms?.find((p) => p.id === ip.platform_id), i18n.language))
      .filter(Boolean)

  // Page-wide date filter (bar above the tabs) -- applies to folder counts,
  // the table view, and the calendar view alike, so "везде" a July-August
  // pick means June items disappear everywhere, not just in one view. Empty
  // means no filter, not "no items" (calendar still self-scopes to its
  // visible month independently -- see ContentCalendarView).
  const dateFilteredItems = useMemo(() => {
    if (!dateFrom && !dateTo) return items ?? []
    return (items ?? []).filter((item) => {
      if (dateFrom && (!item.publish_date || item.publish_date < dateFrom)) return false
      if (dateTo && (!item.publish_date || item.publish_date > dateTo)) return false
      return true
    })
  }, [items, dateFrom, dateTo])

  const itemCountFor = (projectId: string) =>
    dateFilteredItems.filter((i) => i.project_id === projectId).length

  const visibleFolders = useMemo(
    () =>
      (projects ?? []).filter((p) => p.name.toLowerCase().includes(folderSearch.toLowerCase())),
    [projects, folderSearch]
  )

  const itemsForSelectedProject = useMemo(
    () => dateFilteredItems.filter((item) => item.project_id === selectedProjectId),
    [dateFilteredItems, selectedProjectId]
  )

  // Platform only, no date -- date is already applied upstream in
  // dateFilteredItems. Shared by the table (which also narrows by
  // statusFilter) and the per-status stats strip below (which needs every
  // status's count, so it can't itself be narrowed to one).
  const itemsForStats = useMemo(() => {
    return itemsForSelectedProject.filter((item) => {
      if (platformFilter) {
        const ids = (itemPlatforms ?? [])
          .filter((ip) => ip.content_plan_item_id === item.id)
          .map((ip) => ip.platform_id)
        if (!ids.includes(platformFilter)) return false
      }
      return true
    })
  }, [itemsForSelectedProject, itemPlatforms, platformFilter])

  const filtered = useMemo(
    () => itemsForStats.filter((item) => !statusFilter || item.status_id === statusFilter),
    [itemsForStats, statusFilter]
  )

  const statusCounts = useMemo(() => {
    const map = new Map<string, number>()
    for (const item of itemsForStats) map.set(item.status_id, (map.get(item.status_id) ?? 0) + 1)
    return map
  }, [itemsForStats])

  function openCreate() {
    setEditingId(null)
    setCreateDate(null)
    setSheetOpen(true)
  }

  function openCreateWithDate(dateStr: string) {
    setEditingId(null)
    setCreateDate(dateStr)
    setSheetOpen(true)
  }

  function openEdit(id: string) {
    setEditingId(id)
    setCreateDate(null)
    setSheetOpen(true)
  }

  function backToFolders() {
    setSelectedProjectId(null)
    setPlatformFilter('')
    setStatusFilter('')
  }

  const hasNestedFilters = platformFilter || statusFilter
  const selectedProjectName = projects?.find((p) => p.id === selectedProjectId)?.name

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <h1 className="text-4xl font-bold tracking-tight">{t('contentPlan.title')}</h1>
        <Button onClick={openCreate}>
          <Plus />
          {t('contentPlan.newItem')}
        </Button>
      </div>

      <Tabs value={view} onValueChange={(v) => setView(String(v))}>
        <TabsList>
          <TabsTrigger value="folders">{t('contentPlan.foldersView')}</TabsTrigger>
          <TabsTrigger value="calendar">{t('contentPlan.calendarView')}</TabsTrigger>
          <TabsTrigger value="table">{t('contentPlan.tableView')}</TabsTrigger>
        </TabsList>

        <TabsContent value="folders" className="flex flex-col gap-8">
          {selectedProjectId === null ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  placeholder={t('contentPlan.searchProjects')}
                  value={folderSearch}
                  onChange={(e) => setFolderSearch(e.target.value)}
                  className="max-w-sm"
                />
                <DateRangeFilter from={dateFrom} to={dateTo} onFromChange={setDateFrom} onToChange={setDateTo} />
              </div>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {visibleFolders.map((p) => (
                  <Card
                    key={p.id}
                    className="cursor-pointer overflow-hidden transition-colors hover:bg-accent"
                    onClick={() => setSelectedProjectId(p.id)}
                  >
                    <ProjectLogoSquare logoUrl={p.logo_url} />
                    <CardContent className="flex flex-col items-center gap-1.5 py-3">
                      <p className="text-center text-sm font-medium">{p.name}</p>
                      <Badge variant="secondary">{itemCountFor(p.id)}</Badge>
                    </CardContent>
                  </Card>
                ))}
                {!isLoading && visibleFolders.length === 0 && (
                  <p className="col-span-full text-sm text-muted-foreground">{t('contentPlan.empty')}</p>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border p-3">
                <Button variant="ghost" size="sm" onClick={backToFolders}>
                  <ArrowLeft className="size-3.5" />
                  {selectedProjectName}
                </Button>
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
                  <span className="text-xs text-muted-foreground">{t('contentPlan.status')}</span>
                  <Select value={statusFilter} onValueChange={(v: string | null) => setStatusFilter(v ?? '')}>
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder={t('contentPlan.allStatuses')}>
                        {() => pickLabel(statuses?.find((s) => s.id === statusFilter), i18n.language)}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {statuses?.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {pickLabel(s, i18n.language)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <DateRangeFilter from={dateFrom} to={dateTo} onFromChange={setDateFrom} onToChange={setDateTo} />
                {hasNestedFilters && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setPlatformFilter('')
                      setStatusFilter('')
                    }}
                  >
                    {t('contentPlan.resetFilters')}
                  </Button>
                )}
              </div>

              {/* Only shown once a specific project is selected -- a
                  project-wide breakdown doesn't mean much across projects
                  mixed together. Counts respect platform/date filters but
                  not the status filter itself, since status is the axis
                  being broken down. */}
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

              <div className="overflow-x-auto rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('contentPlan.topic')}</TableHead>
                      <TableHead>{t('contentPlan.platforms')}</TableHead>
                      <TableHead>{t('contentPlan.status')}</TableHead>
                      <TableHead>{t('contentPlan.shootDate')}</TableHead>
                      <TableHead>{t('contentPlan.publishDate')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground">
                          {t('common.loading')}...
                        </TableCell>
                      </TableRow>
                    )}
                    {!isLoading && filtered.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground">
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
            </>
          )}
        </TabsContent>

        <TabsContent value="calendar">
          <ContentCalendarView
            items={dateFilteredItems}
            dateFrom={dateFrom}
            dateTo={dateTo}
            onDateFromChange={setDateFrom}
            onDateToChange={setDateTo}
            projects={projects}
            statuses={statuses}
            itemPlatforms={itemPlatforms}
            platforms={platforms}
            contentFormats={contentFormats}
            onOpen={openEdit}
            onCreate={openCreateWithDate}
            onMove={handleMove}
          />
        </TabsContent>

        <TabsContent value="table">
          <ContentTableView
            items={dateFilteredItems}
            dateFrom={dateFrom}
            dateTo={dateTo}
            onDateFromChange={setDateFrom}
            onDateToChange={setDateTo}
            projects={projects}
            statuses={statuses}
            itemPlatforms={itemPlatforms}
            platforms={platforms}
            contentFormats={contentFormats}
            contentRubrics={contentRubrics}
            onOpen={openEdit}
          />
        </TabsContent>
      </Tabs>

      <ContentItemSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        itemId={editingId}
        defaultProjectId={selectedProjectId ?? undefined}
        defaultPublishDate={createDate ?? undefined}
      />
    </div>
  )
}
