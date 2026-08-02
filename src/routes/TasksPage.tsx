import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/auth/AuthProvider'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Combobox } from '@/components/ui/combobox'
import { NewTaskButton, TaskSheet } from './TaskSheet'
import { TasksKanban } from './TasksKanban'
import { TaskCard } from '@/components/TaskCard'
import { pickLabel } from '@/lib/localizedLabel'
import { cn } from '@/lib/utils'
import { useCanDeleteTask } from '@/hooks/useCanDeleteTask'

export function TasksPage() {
  const { t, i18n } = useTranslation()
  const { profile, hasCapability } = useAuth()
  const canDeleteTask = useCanDeleteTask()
  const showSubtaskDuration = hasCapability('org.full_access') || hasCapability('projects.manage')
  const [searchParams, setSearchParams] = useSearchParams()
  const view = searchParams.get('view') === 'kanban' ? 'kanban' : 'list'
  const [openTaskId, setOpenTaskId] = useState<string | null>(null)
  const [scopeFilter, setScopeFilter] = useState<'mine' | 'team'>('mine')
  const [employeeFilter, setEmployeeFilter] = useState<string>('')
  const [dateFrom, setDateFrom] = useState<string>('')
  const [dateTo, setDateTo] = useState<string>('')
  const queryClient = useQueryClient()

  const { data: tasks, isLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: async () => {
      // Smart-sort: the view already computes sort_score (priority + deadline
      // proximity), but a view's internal ORDER BY isn't guaranteed to survive
      // an outer query — order explicitly here so it's actually honored.
      const { data, error } = await supabase
        .from('v_task_queue')
        .select(
          'id, title, status_id, deadline, percent_complete, quadrant_id, assignee_profile_id, sort_score, created_via_telegram, completed_at, created_by, project_id'
        )
        .order('sort_score', { ascending: false })
        .order('deadline', { ascending: true, nullsFirst: false })
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

  const taskIds = useMemo(() => (tasks ?? []).map((t) => t.id), [tasks])

  const { data: statuses } = useQuery({
    queryKey: ['task_statuses'],
    queryFn: async () => {
      const { data, error } = await supabase.from('task_statuses').select('id, slug, label_ru, label_uz')
      if (error) throw error
      return data
    },
  })

  const { data: profiles } = useQuery({
    queryKey: ['profiles-lookup'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('id, full_name, avatar_url')
      if (error) throw error
      return data
    },
  })

  const { data: subtasksByTask } = useQuery({
    queryKey: ['task_items-batch', taskIds],
    enabled: taskIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('task_items')
        .select('id, task_id, title, is_done, sort_order, created_at, completed_at')
        .in('task_id', taskIds)
        .order('sort_order')
      if (error) throw error
      const map = new Map<
        string,
        { id: string; title: string; is_done: boolean; created_at: string; completed_at: string | null }[]
      >()
      for (const item of data) {
        const list = map.get(item.task_id) ?? []
        list.push({
          id: item.id,
          title: item.title,
          is_done: item.is_done,
          created_at: item.created_at,
          completed_at: item.completed_at,
        })
        map.set(item.task_id, list)
      }
      return map
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('tasks').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['tasks-kanban'] })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const toggleSubtask = useMutation({
    mutationFn: async ({ id, is_done }: { id: string; is_done: boolean }) => {
      const { error } = await supabase.from('task_items').update({ is_done }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task_items-batch'] })
      queryClient.invalidateQueries({ queryKey: ['task_items'] })
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['tasks-kanban'] })
      queryClient.invalidateQueries({ queryKey: ['cabinet-tasks'] })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const statusLabel = (id: string) => pickLabel(statuses?.find((s) => s.id === id), i18n.language)
  const statusSlug = (id: string) => statuses?.find((s) => s.id === id)?.slug
  const assigneeName = (id: string | null) => profiles?.find((p) => p.id === id)?.full_name
  const assigneeAvatarUrl = (id: string | null) => profiles?.find((p) => p.id === id)?.avatar_url
  const quadrantLabel = (id: string | null) => pickLabel(quadrants?.find((q) => q.id === id), i18n.language)

  const doneStatusId = statuses?.find((s) => s.slug === 'done')?.id

  // RLS only ever hands a plain employee their own tasks, so if this list
  // contains anyone else's, the viewer must be a PM/CEO seeing the wider
  // project queue -- that's the only case the "mine/team" toggle matters.
  const seesOthersTasks = useMemo(
    () => (tasks ?? []).some((t) => t.assignee_profile_id && t.assignee_profile_id !== profile?.id),
    [tasks, profile?.id]
  )

  const teamAssigneeOptions = useMemo(() => {
    const ids = new Set((tasks ?? []).map((t) => t.assignee_profile_id).filter((id): id is string => !!id))
    return (profiles ?? [])
      .filter((p) => ids.has(p.id))
      .map((p) => ({ value: p.id, label: p.full_name }))
  }, [tasks, profiles])

  // Open tasks keep the view's own sort_score/deadline order; completed
  // tasks sink to the bottom, most-recently-completed first. "Completed"
  // here means status = done OR all subtasks checked off (100%) -- staff
  // routinely finish a task by ticking off its checklist and never touch
  // the status dropdown, so status_id alone misses most of what people
  // actually consider "yakunlandi" and left it stuck at the top by its old
  // priority/deadline score.
  const sortedTasks = useMemo(() => {
    if (!tasks) return tasks
    const isDone = (t: (typeof tasks)[number]) => t.status_id === doneStatusId || t.percent_complete >= 100
    const open = tasks.filter((t) => !isDone(t))
    const done = tasks
      .filter((t) => isDone(t))
      .slice()
      .sort((a, b) => new Date(b.completed_at ?? b.deadline ?? 0).getTime() - new Date(a.completed_at ?? a.deadline ?? 0).getTime())
    return [...open, ...done]
  }, [tasks, doneStatusId])

  const hasDateFilter = !!(dateFrom || dateTo)

  const filteredTasks = useMemo(() => {
    let list = sortedTasks ?? []
    if (seesOthersTasks && scopeFilter === 'mine') {
      list = list.filter((t) => t.assignee_profile_id === profile?.id)
    }
    if (seesOthersTasks && scopeFilter === 'team' && employeeFilter) {
      list = list.filter((t) => t.assignee_profile_id === employeeFilter)
    }
    // Default view hides done tasks so the list stays about current work --
    // but a date range is a deliberate "show me what happened in this
    // period" request, so it overrides that and includes done tasks whose
    // deadline falls in range (undated tasks can't match a date range).
    if (hasDateFilter) {
      list = list.filter((t) => {
        if (!t.deadline) return false
        const d = t.deadline.slice(0, 10)
        if (dateFrom && d < dateFrom) return false
        if (dateTo && d > dateTo) return false
        return true
      })
    } else {
      list = list.filter((t) => t.status_id !== doneStatusId)
    }
    return list
  }, [sortedTasks, seesOthersTasks, scopeFilter, employeeFilter, profile?.id, hasDateFilter, dateFrom, dateTo, doneStatusId])

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <h1 className="text-4xl font-bold tracking-tight">{t('tasks.title')}</h1>
        <NewTaskButton />
      </div>

      {seesOthersTasks && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant={scopeFilter === 'mine' ? 'default' : 'outline'}
            onClick={() => setScopeFilter('mine')}
          >
            {t('tasks.filterMine')}
          </Button>
          <Button
            size="sm"
            variant={scopeFilter === 'team' ? 'default' : 'outline'}
            onClick={() => setScopeFilter('team')}
          >
            {t('tasks.filterTeam')}
          </Button>
          {scopeFilter === 'team' && (
            <div className="w-56">
              <Combobox
                options={teamAssigneeOptions}
                value={employeeFilter}
                onChange={setEmployeeFilter}
                placeholder={t('tasks.filterByEmployee')}
              />
            </div>
          )}
        </div>
      )}

      <Tabs
        value={view}
        onValueChange={(v) =>
          setSearchParams(
            (prev) => {
              const next = new URLSearchParams(prev)
              next.set('view', String(v))
              return next
            },
            { replace: true }
          )
        }
      >
        <TabsList>
          <TabsTrigger value="list">{t('tasks.title')}</TabsTrigger>
          <TabsTrigger value="kanban">{t('kanban.title')}</TabsTrigger>
        </TabsList>

        <TabsContent value="list">
          <div className="mb-4 flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">{t('tasks.dateFrom')}</label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="h-8 w-36"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">{t('tasks.dateTo')}</label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="h-8 w-36"
              />
            </div>
            {hasDateFilter && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setDateFrom('')
                  setDateTo('')
                }}
              >
                {t('tasks.resetDateFilter')}
              </Button>
            )}
          </div>

          {isLoading && <p className="text-sm text-muted-foreground">{t('common.loading')}...</p>}
          {!isLoading && filteredTasks.length === 0 && (
            <p className="text-sm text-muted-foreground">{t('tasks.empty')}</p>
          )}
          <div className={cn('grid grid-cols-1 items-start gap-3 sm:grid-cols-2 lg:grid-cols-3')}>
            {filteredTasks.map((task) => (
              <TaskCard
                key={task.id}
                title={task.title}
                statusLabel={statusLabel(task.status_id)}
                statusSlug={statusSlug(task.status_id)}
                quadrantLabel={quadrantLabel(task.quadrant_id)}
                deadline={task.deadline}
                percentComplete={task.percent_complete}
                assigneeName={assigneeName(task.assignee_profile_id)}
                assigneeAvatarUrl={assigneeAvatarUrl(task.assignee_profile_id)}
                subtasks={subtasksByTask?.get(task.id)}
                createdViaBot={task.created_via_telegram}
                onOpen={() => setOpenTaskId(task.id)}
                onDelete={
                  canDeleteTask(task)
                    ? () => {
                        if (window.confirm(t('common.delete') + '?')) deleteMutation.mutate(task.id)
                      }
                    : undefined
                }
                onToggleSubtask={(id, done) => toggleSubtask.mutate({ id, is_done: done })}
                showSubtaskDuration={showSubtaskDuration}
              />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="kanban">
          <TasksKanban
            scopeAssigneeId={seesOthersTasks && scopeFilter === 'mine' ? profile?.id ?? null : null}
            employeeFilterId={seesOthersTasks && scopeFilter === 'team' ? employeeFilter || null : null}
          />
        </TabsContent>
      </Tabs>

      <TaskSheet
        open={!!openTaskId}
        onOpenChange={(open) => !open && setOpenTaskId(null)}
        taskId={openTaskId}
      />
    </div>
  )
}
