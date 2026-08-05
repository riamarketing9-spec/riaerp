import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabaseClient'
import { Card } from '@/components/ui/card'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { BarChart3 } from 'lucide-react'
import { CreateProjectDialog, ProjectDialog } from './CreateProjectDialog'
import { ProjectResultDialog } from './ProjectResultDialog'
import { pickLabel } from '@/lib/localizedLabel'
import { computeMonthlyProgress } from '@/lib/projectMonthlyProgress'
import { MonthlyProgressBreakdown, type MonthlyProgressDetail } from '@/components/MonthlyProgressBreakdown'

// Plain local-calendar date strings, built directly from Y/M/D -- NOT via
// `new Date(y, m, 1).toISOString()`, which converts local midnight to UTC
// and silently shifts the date back a day for any timezone ahead of UTC
// (e.g. Asia/Tashkent, UTC+5): Aug 1 00:00 local becomes Jul 31T19:00Z, so
// slicing to 10 chars yields "2026-07-31" instead of "2026-08-01" -- which
// made "this month's goal" resolve to last month's row instead.
function pad2(n: number) {
  return String(n).padStart(2, '0')
}
function monthRange(date: Date) {
  const y = date.getFullYear()
  const m = date.getMonth()
  const start = `${y}-${pad2(m + 1)}-01`
  const endD = new Date(y, m + 1, 1)
  const end = `${endD.getFullYear()}-${pad2(endD.getMonth() + 1)}-01`
  return { start, end }
}

function ProjectProgressDetailDialog({
  open,
  onOpenChange,
  projectName,
  detail,
  publishedStatusLabel,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectName?: string
  detail: MonthlyProgressDetail | null
  publishedStatusLabel: string
}) {
  const { t } = useTranslation()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t('projects.progressDetail')} {projectName ? `— ${projectName}` : ''}
          </DialogTitle>
        </DialogHeader>
        <MonthlyProgressBreakdown detail={detail} publishedStatusLabel={publishedStatusLabel} />
      </DialogContent>
    </Dialog>
  )
}

export function ProjectsPage() {
  const { t, i18n } = useTranslation()
  const [openProjectId, setOpenProjectId] = useState<string | null>(null)
  const [resultProjectId, setResultProjectId] = useState<string | null>(null)
  const [progressDetailProjectId, setProgressDetailProjectId] = useState<string | null>(null)

  const { data: projects, isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('id, name, logo_url, project_type_id, pm_profile_id')
        .order('name')
      if (error) throw error
      return data
    },
  })

  const { data: projectTypes } = useQuery({
    queryKey: ['project_types'],
    queryFn: async () => {
      const { data, error } = await supabase.from('project_types').select('id, label_ru, label_uz')
      if (error) throw error
      return data
    },
  })

  const { data: managers } = useQuery({
    queryKey: ['managers-with-avatar'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('id, full_name, avatar_url')
      if (error) throw error
      return data
    },
  })

  const projectIds = useMemo(() => (projects ?? []).map((p) => p.id), [projects])

  const monthKeyRef = useMemo(() => monthRange(new Date()), [])
  const currentMonthKey = monthKeyRef.start

  // This month's goal row per project (id only -- the flexible per-format
  // targets are a separate child table, fetched below once we know which
  // goal rows exist).
  const { data: monthlyGoalByProject } = useQuery({
    queryKey: ['projects-monthly-goals', projectIds, currentMonthKey],
    enabled: projectIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_monthly_goals')
        .select('id, project_id')
        .in('project_id', projectIds)
        .eq('month', currentMonthKey)
      if (error) throw error
      return new Map(data.map((row) => [row.project_id, row]))
    },
  })

  const goalIds = useMemo(() => [...(monthlyGoalByProject?.values() ?? [])].map((g) => g.id), [monthlyGoalByProject])

  const { data: goalTargetsByGoalId } = useQuery({
    queryKey: ['project_monthly_goal_targets-batch', goalIds],
    enabled: goalIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_monthly_goal_targets')
        .select('goal_id, format_id, target_count')
        .in('goal_id', goalIds)
      if (error) throw error
      const map = new Map<string, { format_id: string; target_count: number }[]>()
      for (const row of data) {
        const list = map.get(row.goal_id) ?? []
        list.push({ format_id: row.format_id, target_count: row.target_count })
        map.set(row.goal_id, list)
      }
      return map
    },
  })

  const { data: contentFormats } = useQuery({
    queryKey: ['content_formats'],
    queryFn: async () => {
      const { data, error } = await supabase.from('content_formats').select('id, label_ru, label_uz')
      if (error) throw error
      return data
    },
  })

  const { data: publishedStatus } = useQuery({
    queryKey: ['content_statuses-published'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('content_statuses')
        .select('id, label_ru, label_uz')
        .eq('slug', 'published')
        .maybeSingle()
      if (error) throw error
      return data
    },
  })
  const publishedStatusId = publishedStatus?.id ?? null

  // This month's published content-plan items per project, with every work
  // type (иш тури) each one has selected -- the progress bar reflects what
  // actually shipped in the content plan, strictly by work type.
  const { data: monthPublishedItems } = useQuery({
    queryKey: ['projects-quota-content', projectIds, publishedStatusId, monthKeyRef.start],
    enabled: projectIds.length > 0 && !!publishedStatusId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('content_plan_items')
        .select('id, project_id, topic, publish_date')
        .in('project_id', projectIds)
        .eq('status_id', publishedStatusId!)
        .gte('publish_date', monthKeyRef.start.slice(0, 10))
        .lt('publish_date', monthKeyRef.end.slice(0, 10))
      if (error) throw error
      return data
    },
  })

  const publishedItemIds = useMemo(() => (monthPublishedItems ?? []).map((i) => i.id), [monthPublishedItems])

  const { data: publishedItemFormats } = useQuery({
    queryKey: ['projects-quota-content-formats', publishedItemIds],
    enabled: publishedItemIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('content_plan_formats')
        .select('content_plan_item_id, format_id')
        .in('content_plan_item_id', publishedItemIds)
      if (error) throw error
      return data
    },
  })

  const formatLabelOf = (formatId: string) => pickLabel(contentFormats?.find((f) => f.id === formatId), i18n.language) ?? ''

  // No goal set for the current month at all -> don't show a progress bar
  // (per spec: nothing to measure against, so no misleading 0%/percent).
  // Also backs the progress bar's drill-down dialog -- same computation,
  // so the % and "what counted toward it" list can never disagree.
  const progressDetailFor = (project: { id: string }) => {
    const goal = monthlyGoalByProject?.get(project.id)
    const targets = goal ? goalTargetsByGoalId?.get(goal.id) : undefined
    const items = (monthPublishedItems ?? [])
      .filter((i) => i.project_id === project.id)
      .map((i) => ({
        ...i,
        formatIds: (publishedItemFormats ?? [])
          .filter((f) => f.content_plan_item_id === i.id)
          .map((f) => f.format_id),
      }))
    return computeMonthlyProgress({ targets, items, formatLabelOf })
  }

  const { data: assistantsByProject } = useQuery({
    queryKey: ['project_members-assistants-batch', projectIds],
    enabled: projectIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_members')
        .select('project_id, profile_id')
        .in('project_id', projectIds)
        .eq('role_on_project', 'assistant_pm')
      if (error) throw error
      const map = new Map<string, string[]>()
      for (const row of data) {
        const list = map.get(row.project_id) ?? []
        list.push(row.profile_id)
        map.set(row.project_id, list)
      }
      return map
    },
  })

  const manager = (id: string) => managers?.find((m) => m.id === id)

  // PM + assistant PMs, PM first, deduped -- the "responsible" avatars.
  const responsibleFor = (project: { id: string; pm_profile_id: string }) => {
    const ids = [project.pm_profile_id, ...(assistantsByProject?.get(project.id) ?? [])]
    return [...new Set(ids)].map((id) => manager(id)).filter((m): m is NonNullable<typeof m> => !!m)
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <h1 className="text-4xl font-bold tracking-tight">{t('projects.title')}</h1>
        <CreateProjectDialog />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading && <p className="text-sm text-muted-foreground">{t('common.loading')}...</p>}
        {projects?.map((project) => {
          const progress = progressDetailFor(project)?.percent ?? null
          return (
            <Card
              key={project.id}
              className="cursor-pointer overflow-hidden p-0 transition-colors hover:bg-muted/40"
              onClick={() => setOpenProjectId(project.id)}
            >
              <div className="flex h-40 w-full items-center justify-center overflow-hidden bg-white p-4">
                {project.logo_url && (
                  <img src={project.logo_url} alt="" className="h-full w-full object-contain" />
                )}
              </div>
              <div className="flex flex-col gap-2.5 p-4">
                <div>
                  <h3 className="truncate font-semibold">{project.name}</h3>
                  <p className="text-xs text-muted-foreground">
                    {pickLabel(projectTypes?.find((pt) => pt.id === project.project_type_id), i18n.language)}
                  </p>
                </div>

                {progress !== null && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setProgressDetailProjectId(project.id)
                    }}
                    className="relative h-5 w-full overflow-hidden rounded-full bg-muted"
                  >
                    <div
                      className="h-full rounded-full bg-brand-600 transition-[width] duration-500 ease-out"
                      style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                    />
                    <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.6)]">
                      {progress}%
                    </span>
                  </button>
                )}

                <div className="flex items-center justify-between gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => {
                      e.stopPropagation()
                      setResultProjectId(project.id)
                    }}
                  >
                    <BarChart3 className="size-3.5" />
                    {t('projects.result')}
                  </Button>
                  <div className="flex items-center justify-end -space-x-2">
                    {responsibleFor(project).map((m) => (
                      <Avatar
                        key={m.id}
                        name={m.full_name}
                        avatarUrl={m.avatar_url}
                        className="size-7 rounded-full text-[10px] ring-2 ring-background"
                      />
                    ))}
                  </div>
                </div>
              </div>
            </Card>
          )
        })}
        {!isLoading && (projects?.length ?? 0) === 0 && (
          <p className="text-sm text-muted-foreground">—</p>
        )}
      </div>

      <ProjectDialog
        open={!!openProjectId}
        onOpenChange={(open) => !open && setOpenProjectId(null)}
        projectId={openProjectId}
      />
      <ProjectResultDialog
        projectId={resultProjectId}
        projectName={projects?.find((p) => p.id === resultProjectId)?.name}
        open={!!resultProjectId}
        onOpenChange={(open) => !open && setResultProjectId(null)}
      />
      <ProjectProgressDetailDialog
        open={!!progressDetailProjectId}
        onOpenChange={(open) => !open && setProgressDetailProjectId(null)}
        projectName={projects?.find((p) => p.id === progressDetailProjectId)?.name}
        detail={progressDetailProjectId ? progressDetailFor({ id: progressDetailProjectId }) : null}
        publishedStatusLabel={pickLabel(publishedStatus, i18n.language) ?? ''}
      />
    </div>
  )
}
