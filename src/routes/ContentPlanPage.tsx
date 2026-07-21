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
import { pickLabel, formatLocalDate } from '@/lib/localizedLabel'
import { ArrowLeft, Folder, Plus } from 'lucide-react'

export function ContentPlanPage() {
  const { t, i18n } = useTranslation()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [createDate, setCreateDate] = useState<string | null>(null)
  const [folderSearch, setFolderSearch] = useState('')
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

  const statusLabel = (id: string) =>
    pickLabel(statuses?.find((s) => s.id === id), i18n.language) ?? '—'
  const platformsFor = (itemId: string) =>
    (itemPlatforms ?? [])
      .filter((ip) => ip.content_plan_item_id === itemId)
      .map((ip) => pickLabel(platforms?.find((p) => p.id === ip.platform_id), i18n.language))
      .filter(Boolean)

  const itemCountFor = (projectId: string) => (items ?? []).filter((i) => i.project_id === projectId).length

  const visibleFolders = useMemo(
    () =>
      (projects ?? []).filter((p) => p.name.toLowerCase().includes(folderSearch.toLowerCase())),
    [projects, folderSearch]
  )

  const itemsForSelectedProject = useMemo(
    () => (items ?? []).filter((item) => item.project_id === selectedProjectId),
    [items, selectedProjectId]
  )

  const filtered = useMemo(() => {
    return itemsForSelectedProject.filter((item) => {
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
  }, [itemsForSelectedProject, itemPlatforms, platformFilter, dateFrom, dateTo])

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
    setDateFrom('')
    setDateTo('')
  }

  const hasNestedFilters = platformFilter || dateFrom || dateTo
  const selectedProjectName = projects?.find((p) => p.id === selectedProjectId)?.name

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{t('contentPlan.title')}</h1>
        <Button onClick={openCreate}>
          <Plus />
          {t('contentPlan.newItem')}
        </Button>
      </div>

      <Tabs defaultValue="folders">
        <TabsList>
          <TabsTrigger value="folders">{t('contentPlan.foldersView')}</TabsTrigger>
          <TabsTrigger value="calendar">{t('contentPlan.calendarView')}</TabsTrigger>
        </TabsList>

        <TabsContent value="folders" className="flex flex-col gap-6">
          {selectedProjectId === null ? (
            <>
              <Input
                placeholder={t('contentPlan.searchProjects')}
                value={folderSearch}
                onChange={(e) => setFolderSearch(e.target.value)}
                className="max-w-sm"
              />
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {visibleFolders.map((p) => (
                  <Card
                    key={p.id}
                    className="cursor-pointer transition-colors hover:bg-accent"
                    onClick={() => setSelectedProjectId(p.id)}
                  >
                    <CardContent className="flex flex-col items-center gap-2 py-6">
                      <Folder className="size-10 text-muted-foreground" />
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
                  <span className="text-xs text-muted-foreground">{t('contentPlan.dateFrom')}</span>
                  <Input type="date" className="w-40" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs text-muted-foreground">{t('contentPlan.dateTo')}</span>
                  <Input type="date" className="w-40" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                </div>
                {hasNestedFilters && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setPlatformFilter('')
                      setDateFrom('')
                      setDateTo('')
                    }}
                  >
                    {t('contentPlan.resetFilters')}
                  </Button>
                )}
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
            items={items ?? []}
            projects={projects}
            statuses={statuses}
            itemPlatforms={itemPlatforms}
            platforms={platforms}
            onOpen={openEdit}
            onCreate={openCreateWithDate}
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
