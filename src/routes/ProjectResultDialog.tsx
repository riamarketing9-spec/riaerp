import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabaseClient'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Combobox } from '@/components/ui/combobox'
import { formatLocalDate, pickLabel } from '@/lib/localizedLabel'

// Flexible, not a fixed Stories/Posts/Video/Edits/Shoots list -- whatever
// work types (иш тури) actually appear on published (жойланди)
// content-plan items in range show up, nothing hardcoded. Same source
// (content_plan_deliverable_types) and same "each type counts on its
// own" granularity as the monthly-goal % calc and the employee report.
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
        .select('id, topic, publish_date')
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

  const { data: itemDeliverableTypes } = useQuery({
    queryKey: ['project-result-deliverable-types', itemIds],
    enabled: itemIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('content_plan_deliverable_types')
        .select('content_plan_item_id, deliverable_type_id')
        .in('content_plan_item_id', itemIds)
      if (error) throw error
      return data
    },
  })

  const { data: deliverableTypes } = useQuery({
    queryKey: ['deliverable_types'],
    queryFn: async () => {
      const { data, error } = await supabase.from('deliverable_types').select('id, label_ru, label_uz')
      if (error) throw error
      return data
    },
  })

  const passesPlatform = (itemId: string) =>
    !platformFilter || (itemPlatforms ?? []).some((ip) => ip.content_plan_item_id === itemId && ip.platform_id === platformFilter)

  const filteredItems = (items ?? []).filter((i) => passesPlatform(i.id))
  const filteredItemIds = new Set(filteredItems.map((i) => i.id))

  // One group per work type actually present -- each item counts toward
  // every type it has, not just one bucket.
  const byType = new Map<string, { topic: string; publish_date: string | null }[]>()
  for (const link of itemDeliverableTypes ?? []) {
    if (!filteredItemIds.has(link.content_plan_item_id)) continue
    const item = filteredItems.find((i) => i.id === link.content_plan_item_id)
    if (!item) continue
    const list = byType.get(link.deliverable_type_id) ?? []
    list.push({ topic: item.topic, publish_date: item.publish_date })
    byType.set(link.deliverable_type_id, list)
  }
  const groups = [...byType.entries()]
    .map(([typeId, entries]) => ({
      typeId,
      label: pickLabel(deliverableTypes?.find((d) => d.id === typeId), i18n.language) ?? '—',
      entries,
    }))
    .sort((a, b) => b.entries.length - a.entries.length)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
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

          {groups.length === 0 && (
            <p className="text-sm text-muted-foreground">{t('projects.progressDetailEmpty')}</p>
          )}

          {groups.map((g) => (
            <div key={g.typeId} className="flex flex-col gap-1.5 rounded-lg border border-border p-3">
              <div className="flex items-center justify-between text-sm font-medium">
                <span>{g.label}</span>
                <span className="font-semibold">{g.entries.length}</span>
              </div>
              {g.entries.map((e, i) => (
                <div key={i} className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2 py-1.5 text-xs">
                  <span className="flex-1 truncate">{e.topic}</span>
                  <Badge variant="secondary" className="shrink-0 text-[10px]">
                    {formatLocalDate(e.publish_date, i18n.language)}
                  </Badge>
                </div>
              ))}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
