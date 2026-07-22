import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabaseClient'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { TaskCard, type TaskCardSubtask } from '@/components/TaskCard'
import { pickLabel } from '@/lib/localizedLabel'
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

  return (
    <>
      <Dialog open={!!profileId} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{profileName}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(tasks?.length ?? 0) === 0 && (
              <p className="text-sm text-muted-foreground">{t('tasks.empty')}</p>
            )}
            {tasks?.map((task) => (
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
            ))}
          </div>
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

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t('workload.title')}</h1>

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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {isLoading && <p className="text-sm text-muted-foreground">{t('common.loading')}...</p>}
        {visibleWorkload.map((row) => {
          const employeeKpi = kpiFor(row.profile_id)
          return (
            <Card
              key={row.profile_id}
              className="cursor-pointer transition-colors hover:bg-accent"
              onClick={() => setOpenProfileId(row.profile_id)}
            >
              <CardContent className="flex flex-col gap-2 py-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">{row.full_name}</p>
                  <Badge variant="secondary">{row.open_task_count}</Badge>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{t('workload.openTasks')}</span>
                  {employeeKpi && (
                    <span>
                      {t('kpi.tasksCompleted')}: {employeeKpi.tasks_completed} ·{' '}
                      {employeeKpi.avg_percent_complete ? Math.round(employeeKpi.avg_percent_complete) : 0}%
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
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
