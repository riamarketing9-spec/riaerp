import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabaseClient'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TaskCard, type TaskCardSubtask } from '@/components/TaskCard'
import { Avatar } from '@/components/Avatar'
import { pickLabel } from '@/lib/localizedLabel'
import { cn } from '@/lib/utils'
import { TaskSheet } from './TaskSheet'

function EmployeeTasksDialog({
  profileId,
  profileName,
  onOpenChange,
}: {
  profileId: string | null
  profileName?: string
  onOpenChange: (open: boolean) => void
}) {
  const { t, i18n } = useTranslation()
  const [openTaskId, setOpenTaskId] = useState<string | null>(null)

  const { data: tasks } = useQuery({
    queryKey: ['workload-employee-tasks', profileId],
    enabled: !!profileId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_task_queue')
        .select('id, title, status_id, deadline, percent_complete, quadrant_id, project_id, created_via_telegram')
        .eq('assignee_profile_id', profileId!)
        .order('sort_score', { ascending: false })
      if (error) throw error
      return data
    },
  })

  const { data: statuses } = useQuery({
    queryKey: ['task_statuses'],
    queryFn: async () => {
      const { data, error } = await supabase.from('task_statuses').select('id, slug, label_ru, label_uz')
      if (error) throw error
      return data
    },
  })

  const { data: quadrants } = useQuery({
    queryKey: ['task_priority_quadrants'],
    queryFn: async () => {
      const { data, error } = await supabase.from('task_priority_quadrants').select('id, slug, label_ru, label_uz')
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

  const taskIds = useMemo(() => (tasks ?? []).map((t) => t.id), [tasks])

  const { data: subtasksByTask } = useQuery({
    queryKey: ['task_items-batch', taskIds],
    enabled: taskIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('task_items')
        .select('id, task_id, title, is_done, sort_order')
        .in('task_id', taskIds)
        .order('sort_order')
      if (error) throw error
      const map = new Map<string, TaskCardSubtask[]>()
      for (const item of data) {
        const list = map.get(item.task_id) ?? []
        list.push({ id: item.id, title: item.title, is_done: item.is_done })
        map.set(item.task_id, list)
      }
      return map
    },
  })

  const statusLabel = (id: string) => pickLabel(statuses?.find((s) => s.id === id), i18n.language)
  const statusSlug = (id: string) => statuses?.find((s) => s.id === id)?.slug
  const quadrantLabel = (id: string | null) => pickLabel(quadrants?.find((q) => q.id === id), i18n.language)
  const projectName = (id: string | null) => projects?.find((p) => p.id === id)?.name

  const activeTasks = (tasks ?? []).filter((task) => statusSlug(task.status_id) !== 'done')
  const archivedTasks = (tasks ?? []).filter((task) => statusSlug(task.status_id) === 'done')

  const renderTask = (task: NonNullable<typeof tasks>[number]) => (
    <TaskCard
      key={task.id}
      title={`${projectName(task.project_id) ? projectName(task.project_id) + ' — ' : ''}${task.title}`}
      statusLabel={statusLabel(task.status_id)}
      statusSlug={statusSlug(task.status_id)}
      quadrantLabel={quadrantLabel(task.quadrant_id)}
      deadline={task.deadline}
      percentComplete={task.percent_complete}
      subtasks={subtasksByTask?.get(task.id)}
      createdViaBot={task.created_via_telegram}
      onOpen={() => setOpenTaskId(task.id)}
    />
  )

  return (
    <>
      <Dialog open={!!profileId} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{profileName}</DialogTitle>
          </DialogHeader>
          <Tabs defaultValue="active">
            <TabsList>
              <TabsTrigger value="active">
                {t('workload.active')} ({activeTasks.length})
              </TabsTrigger>
              <TabsTrigger value="archive">
                {t('workload.archive')} ({archivedTasks.length})
              </TabsTrigger>
            </TabsList>
            <TabsContent value="active">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {activeTasks.length === 0 && (
                  <p className="text-sm text-muted-foreground">{t('workload.noActive')}</p>
                )}
                {activeTasks.map(renderTask)}
              </div>
            </TabsContent>
            <TabsContent value="archive">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {archivedTasks.length === 0 && (
                  <p className="text-sm text-muted-foreground">{t('workload.noArchive')}</p>
                )}
                {archivedTasks.map(renderTask)}
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
      <TaskSheet open={!!openTaskId} onOpenChange={(open) => !open && setOpenTaskId(null)} taskId={openTaskId} />
    </>
  )
}

export function WorkloadPage() {
  const { t } = useTranslation()
  const [startsAfter, setStartsAfter] = useState('')
  const [openProfileId, setOpenProfileId] = useState<string | null>(null)

  const { data: workload, isLoading } = useQuery({
    queryKey: ['workload'],
    queryFn: async () => {
      const { data, error } = await supabase.from('v_employee_workload').select('*')
      if (error) throw error
      return data
    },
  })

  const { data: kpi } = useQuery({
    queryKey: ['v_employee_kpi'],
    queryFn: async () => {
      const { data, error } = await supabase.from('v_employee_kpi').select('*')
      if (error) throw error
      return data
    },
  })

  const { data: startedTasks } = useQuery({
    queryKey: ['tasks-started', startsAfter],
    enabled: !!startsAfter,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select('assignee_profile_id')
        .gte('starts_at', startsAfter)
      if (error) throw error
      return data
    },
  })

  const kpiFor = (profileId: string) => kpi?.find((k) => k.profile_id === profileId)

  const startedProfileIds = useMemo(
    () => new Set((startedTasks ?? []).map((t) => t.assignee_profile_id).filter(Boolean)),
    [startedTasks]
  )

  const visibleWorkload = (workload ?? []).filter(
    (row) => !startsAfter || startedProfileIds.has(row.profile_id)
  )

  const openProfileName = visibleWorkload.find((w) => w.profile_id === openProfileId)?.full_name

  // Most-loaded first, so overload is visible without scanning the grid.
  const sortedWorkload = [...visibleWorkload].sort((a, b) => b.open_task_count - a.open_task_count)

  // Border-only tiering (card stays white/neutral otherwise): 0-1 open
  // tasks reads as free, 2-3 as getting busy (yellow), 4+ as overloaded
  // (orange) — mirrors [[feedback_no_silent_removals]]-safe additive styling.
  function loadTier(count: number) {
    if (count > 3) {
      return {
        border: 'border-orange-400 dark:border-orange-600',
        ring: 'shadow-orange-200/60 dark:shadow-orange-900/40',
        badge: 'bg-orange-500 text-white',
        glow: 'from-orange-400/15',
      }
    }
    if (count >= 2) {
      return {
        border: 'border-amber-300 dark:border-amber-600',
        ring: 'shadow-amber-200/60 dark:shadow-amber-900/40',
        badge: 'bg-amber-400 text-amber-950',
        glow: 'from-amber-400/15',
      }
    }
    return {
      border: 'border-border',
      ring: 'shadow-black/5',
      badge: 'bg-muted text-muted-foreground',
      glow: 'from-transparent',
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-4xl font-bold tracking-tight">{t('workload.title')}</h1>

      <div className="flex items-end gap-3 rounded-lg border border-border p-3">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">{t('workloadPage.startsAfter')}</Label>
          <Input
            type="date"
            className="w-44"
            value={startsAfter}
            onChange={(e) => setStartsAfter(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading && <p className="text-sm text-muted-foreground">{t('common.loading')}...</p>}
        {sortedWorkload.map((row) => {
          const employeeKpi = kpiFor(row.profile_id)
          const tier = loadTier(row.open_task_count)
          return (
            <button
              key={row.profile_id}
              type="button"
              onClick={() => setOpenProfileId(row.profile_id)}
              className={cn(
                'group relative flex flex-col gap-3 overflow-hidden rounded-2xl border-2 bg-card p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg',
                tier.border,
                tier.ring
              )}
            >
              <div
                className={cn(
                  'pointer-events-none absolute inset-0 bg-gradient-to-br to-transparent opacity-0 transition-opacity group-hover:opacity-100',
                  tier.glow
                )}
              />
              <div className="relative flex items-center gap-3">
                <Avatar name={row.full_name} className="size-11 rounded-xl text-sm" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <p className="truncate text-sm font-semibold">{row.full_name}</p>
                  <span className="text-xs text-muted-foreground">{t('workload.openTasks')}</span>
                </div>
                <span
                  className={cn(
                    'flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold',
                    tier.badge
                  )}
                >
                  {row.open_task_count}
                </span>
              </div>

              {employeeKpi && (
                <div className="relative flex items-center justify-between border-t border-dashed border-border pt-2 text-xs text-muted-foreground">
                  <span>{t('kpi.tasksCompleted')}</span>
                  <Badge variant="secondary">{employeeKpi.tasks_completed}</Badge>
                </div>
              )}
            </button>
          )
        })}
      </div>

      <EmployeeTasksDialog
        profileId={openProfileId}
        profileName={openProfileName}
        onOpenChange={(open) => !open && setOpenProfileId(null)}
      />
    </div>
  )
}
