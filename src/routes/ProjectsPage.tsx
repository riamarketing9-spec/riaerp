import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabaseClient'
import { Card } from '@/components/ui/card'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/ui/button'
import { BarChart3 } from 'lucide-react'
import { CreateProjectDialog, ProjectDialog } from './CreateProjectDialog'
import { ProjectResultDialog } from './ProjectResultDialog'
import { pickLabel } from '@/lib/localizedLabel'

// Which "ish turi" (deliverable type) label counts toward the target quota
// -- matched by label_uz since new types get added through the lookup
// admin UI with auto-generated, unpredictable slugs.
const TARGET_LABELS = ['target sozlash', "voronka bo'yicha ishlash"]

function monthRange(date: Date) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1)
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 1)
  return { start: start.toISOString(), end: end.toISOString() }
}

export function ProjectsPage() {
  const { t, i18n } = useTranslation()
  const [openProjectId, setOpenProjectId] = useState<string | null>(null)
  const [resultProjectId, setResultProjectId] = useState<string | null>(null)

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

  const { data: doneStatusId } = useQuery({
    queryKey: ['task_statuses-done-id'],
    queryFn: async () => {
      const { data, error } = await supabase.from('task_statuses').select('id, slug').eq('slug', 'done').maybeSingle()
      if (error) throw error
      return data?.id ?? null
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

  const projectIds = useMemo(() => (projects ?? []).map((p) => p.id), [projects])

  const monthKeyRef = useMemo(() => monthRange(new Date()), [])
  const currentMonthKey = monthKeyRef.start.slice(0, 7) + '-01'

  // This month's structured goal (target_posts/target_stories/target_ads)
  // per project -- replaces the old always-on projects.monthly_quota_*
  // columns, which never actually varied month to month.
  const { data: monthlyGoalByProject } = useQuery({
    queryKey: ['projects-monthly-goals', projectIds, currentMonthKey],
    enabled: projectIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_monthly_goals')
        .select('project_id, target_posts, target_stories, target_ads')
        .in('project_id', projectIds)
        .eq('month', currentMonthKey)
      if (error) throw error
      return new Map(data.map((row) => [row.project_id, row]))
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

  const { data: contentFormats } = useQuery({
    queryKey: ['content_formats'],
    queryFn: async () => {
      const { data, error } = await supabase.from('content_formats').select('id, slug')
      if (error) throw error
      return data
    },
  })

  // This month's published content-plan items per project, by format -- the
  // progress bar now reflects what actually shipped in the content plan
  // (posts/reels quota), not task completion.
  const { data: monthPublishedItems } = useQuery({
    queryKey: ['projects-quota-content', projectIds, publishedStatusId, monthKeyRef.start],
    enabled: projectIds.length > 0 && !!publishedStatusId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('content_plan_items')
        .select('id, project_id, format_id')
        .in('project_id', projectIds)
        .eq('status_id', publishedStatusId!)
        .gte('publish_date', monthKeyRef.start.slice(0, 10))
        .lt('publish_date', monthKeyRef.end.slice(0, 10))
      if (error) throw error
      return data
    },
  })

  // Target quota still comes from tasks -- content plan has no "target"
  // format, that work is tracked as a deliverable type on tasks instead.
  const { data: monthDoneTasks } = useQuery({
    queryKey: ['projects-quota-tasks', projectIds, doneStatusId, monthKeyRef.start],
    enabled: projectIds.length > 0 && !!doneStatusId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select('id, project_id')
        .in('project_id', projectIds)
        .eq('status_id', doneStatusId!)
        .gte('completed_at', monthKeyRef.start)
        .lt('completed_at', monthKeyRef.end)
      if (error) throw error
      return data
    },
  })

  const taskIdsForQuota = useMemo(() => (monthDoneTasks ?? []).map((t) => t.id), [monthDoneTasks])

  const { data: taskDeliverables } = useQuery({
    queryKey: ['task_deliverable_types-for-quota', taskIdsForQuota],
    enabled: taskIdsForQuota.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('task_deliverable_types')
        .select('task_id, deliverable_type_id')
        .in('task_id', taskIdsForQuota)
      if (error) throw error
      return data
    },
  })

  // No goal set for the current month at all -> don't show a progress bar
  // (per spec: nothing to measure against, so no misleading 0%/percent).
  const quotaProgressFor = (project: { id: string }) => {
    const goal = monthlyGoalByProject?.get(project.id)
    if (!goal) return null
    const quotaTotal = goal.target_posts + goal.target_stories + (goal.target_ads ? 1 : 0)
    if (quotaTotal === 0) return null

    const formatSlug = (formatId: string) => contentFormats?.find((f) => f.id === formatId)?.slug
    const labelFor = (deliverableTypeId: string) =>
      deliverableTypes?.find((d) => d.id === deliverableTypeId)?.label_uz.trim().toLowerCase() ?? ''

    // "Post" target counts reels + post + carousel together, per spec.
    const projectItems = (monthPublishedItems ?? []).filter((i) => i.project_id === project.id)
    const postsDone = projectItems.filter((i) => ['post', 'reels', 'carousel'].includes(formatSlug(i.format_id) ?? '')).length
    const storiesDone = projectItems.filter((i) => formatSlug(i.format_id) === 'stories').length

    const doneTaskIds = new Set((monthDoneTasks ?? []).filter((t) => t.project_id === project.id).map((t) => t.id))
    let targetDone = false
    for (const taskId of doneTaskIds) {
      const labels = (taskDeliverables ?? []).filter((td) => td.task_id === taskId).map((td) => labelFor(td.deliverable_type_id))
      if (labels.some((l) => TARGET_LABELS.includes(l))) targetDone = true
    }

    const doneTotal =
      Math.min(postsDone, goal.target_posts) +
      Math.min(storiesDone, goal.target_stories) +
      (goal.target_ads && targetDone ? 1 : 0)

    return Math.round((doneTotal / quotaTotal) * 100)
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
          const progress = quotaProgressFor(project)
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
                  <div className="relative h-5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-brand-600 transition-[width]"
                      style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                    />
                    <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.6)]">
                      {progress}%
                    </span>
                  </div>
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
    </div>
  )
}
