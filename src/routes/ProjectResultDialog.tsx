import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabaseClient'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Combobox } from '@/components/ui/combobox'
import { pickLabel } from '@/lib/localizedLabel'

// Same labels as ProjectsPage's quota calc -- "edits/shoots done" reads off
// these task deliverable-type labels, not content-plan (which has no
// shoot/edit format of its own).
const EDIT_LABELS = ['reels montaji', 'video montaji']
const SHOOT_LABELS = ['syomka']

export function ProjectResultDialog({
  projectId,
  projectName,
  open,
  onOpenChange,
}: {
  projectId: string | null
  projectName?: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t, i18n } = useTranslation()
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [platformFilter, setPlatformFilter] = useState('')

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
      const { data, error } = await supabase.from('content_formats').select('id, slug')
      if (error) throw error
      return data
    },
  })

  const { data: publishedStatusId } = useQuery({
    queryKey: ['content_statuses-published-id'],
    queryFn: async () => {
      const { data, error } = await supabase.from('content_statuses').select('id').eq('slug', 'published').maybeSingle()
      if (error) throw error
      return data?.id ?? null
    },
  })

  const { data: items } = useQuery({
    queryKey: ['project-result-content', projectId, publishedStatusId, dateFrom, dateTo],
    enabled: open && !!projectId && !!publishedStatusId,
    queryFn: async () => {
      let query = supabase
        .from('content_plan_items')
        .select('id, publish_date')
        .eq('project_id', projectId!)
        .eq('status_id', publishedStatusId!)
      if (dateFrom) query = query.gte('publish_date', dateFrom)
      if (dateTo) query = query.lte('publish_date', dateTo)
      const { data, error } = await query
      if (error) throw error
      return data
    },
  })

  const itemIds = (items ?? []).map((i) => i.id)
  const { data: itemPlatforms } = useQuery({
    queryKey: ['project-result-platforms', itemIds],
    enabled: itemIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('content_plan_platforms')
        .select('content_plan_item_id, platform_id')
        .in('content_plan_item_id', itemIds)
      if (error) throw error
      return data
    },
  })

  const { data: itemFormats } = useQuery({
    queryKey: ['project-result-formats', itemIds],
    enabled: itemIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('content_plan_formats')
        .select('content_plan_item_id, format_id')
        .in('content_plan_item_id', itemIds)
      if (error) throw error
      return data
    },
  })

  const { data: doneStatusId } = useQuery({
    queryKey: ['task_statuses-done-id'],
    queryFn: async () => {
      const { data, error } = await supabase.from('task_statuses').select('id').eq('slug', 'done').maybeSingle()
      if (error) throw error
      return data?.id ?? null
    },
  })

  const { data: doneTasks } = useQuery({
    queryKey: ['project-result-tasks', projectId, doneStatusId, dateFrom, dateTo],
    enabled: open && !!projectId && !!doneStatusId,
    queryFn: async () => {
      let query = supabase
        .from('tasks')
        .select('id, completed_at')
        .eq('project_id', projectId!)
        .eq('status_id', doneStatusId!)
        .not('completed_at', 'is', null)
      if (dateFrom) query = query.gte('completed_at', dateFrom)
      if (dateTo) query = query.lte('completed_at', `${dateTo}T23:59:59`)
      const { data, error } = await query
      if (error) throw error
      return data
    },
  })

  const taskIds = (doneTasks ?? []).map((t) => t.id)
  const { data: taskDeliverables } = useQuery({
    queryKey: ['project-result-task-deliverables', taskIds],
    enabled: taskIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('task_deliverable_types')
        .select('task_id, deliverable_type_id')
        .in('task_id', taskIds)
      if (error) throw error
      return data
    },
  })

  const { data: deliverableTypes } = useQuery({
    queryKey: ['deliverable_types-lookup'],
    queryFn: async () => {
      const { data, error } = await supabase.from('deliverable_types').select('id, label_uz')
      if (error) throw error
      return data
    },
  })

  const formatSlugsFor = (itemId: string) =>
    (itemFormats ?? [])
      .filter((f) => f.content_plan_item_id === itemId)
      .map((f) => contentFormats?.find((cf) => cf.id === f.format_id)?.slug)
      .filter((s): s is string => !!s)
  const passesPlatform = (itemId: string) =>
    !platformFilter || (itemPlatforms ?? []).some((ip) => ip.content_plan_item_id === itemId && ip.platform_id === platformFilter)

  // A single item now counts toward every work type it has selected --
  // stories + post both checked means +1 to each, not one or the other.
  const filteredItems = (items ?? []).filter((i) => passesPlatform(i.id))
  const storiesCount = filteredItems.filter((i) => formatSlugsFor(i.id).includes('stories')).length
  const postsCount = filteredItems.filter((i) => formatSlugsFor(i.id).some((s) => ['post', 'reels', 'carousel'].includes(s))).length
  const videoCount = filteredItems.filter((i) => formatSlugsFor(i.id).includes('video')).length

  const deliverableLabelFor = (deliverableTypeId: string) =>
    deliverableTypes?.find((d) => d.id === deliverableTypeId)?.label_uz.trim().toLowerCase() ?? ''
  const taskHasLabel = (taskId: string, labels: string[]) =>
    (taskDeliverables ?? []).some((td) => td.task_id === taskId && labels.includes(deliverableLabelFor(td.deliverable_type_id)))
  const editsCount = (doneTasks ?? []).filter((tsk) => taskHasLabel(tsk.id, EDIT_LABELS)).length
  const shootsCount = (doneTasks ?? []).filter((tsk) => taskHasLabel(tsk.id, SHOOT_LABELS)).length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t('projects.result')} {projectName ? `— ${projectName}` : ''}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{t('contentPlan.dateFrom')}</Label>
              <Input type="date" className="h-8 w-36" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{t('contentPlan.dateTo')}</Label>
              <Input type="date" className="h-8 w-36" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{t('contentPlan.platforms')}</Label>
              <Combobox
                className="h-8 w-36"
                options={(platforms ?? []).map((p) => ({ value: p.id, label: pickLabel(p, i18n.language) ?? '' }))}
                value={platformFilter}
                onChange={setPlatformFilter}
                placeholder={t('contentPlan.allPlatforms')}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5 rounded-lg border border-border p-3">
            <div className="flex items-center justify-between text-sm">
              <span>{t('projects.resultStories')}</span>
              <span className="font-semibold">{storiesCount}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span>{t('projects.resultPosts')}</span>
              <span className="font-semibold">{postsCount}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span>{t('projects.resultVideo')}</span>
              <span className="font-semibold">{videoCount}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span>{t('projects.resultEdits')}</span>
              <span className="font-semibold">{editsCount}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span>{t('projects.resultShoots')}</span>
              <span className="font-semibold">{shootsCount}</span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
