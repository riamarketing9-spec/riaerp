import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/auth/AuthProvider'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { TaskSheet } from './TaskSheet'
import { TaskCard, type TaskCardSubtask } from '@/components/TaskCard'
import { formatLocalDate } from '@/lib/localizedLabel'
import { Button } from '@/components/ui/button'
import { Trash2 } from 'lucide-react'
import { telegramDeepLink } from '@/lib/telegram'
import { TimeTrackerWidget } from '@/components/TimeTrackerWidget'
import { StatCard } from '@/components/StatCard'

function formatMoney(n: number) {
  return new Intl.NumberFormat('ru-RU').format(n)
}

function useSubtasksBatch(taskIds: string[]) {
  return useQuery({
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
}

function DeadlinesWidget() {
  const { t, i18n } = useTranslation()
  const { data: tasks } = useQuery({
    queryKey: ['dashboard-deadlines'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_task_queue')
        .select('id, title, deadline, assignee_profile_id')
        .not('deadline', 'is', null)
        .lte('deadline', new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString())
        .order('deadline', { ascending: true })
      if (error) throw error
      return data
    },
  })

  if (!tasks || tasks.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-medium">{t('dashboard.deadlines')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {tasks.map((task) => {
          const overdue = new Date(task.deadline!) < new Date()
          return (
            <div
              key={task.id}
              className={`flex items-center justify-between rounded-lg border p-2.5 text-sm ${
                overdue
                  ? 'border-destructive/30 bg-destructive/10'
                  : 'border-amber-300/50 bg-amber-50 dark:bg-amber-900/20'
              }`}
            >
              <span className="font-medium">{task.title}</span>
              <Badge variant={overdue ? 'destructive' : 'secondary'} className="text-[10px]">
                {overdue ? t('dashboard.overdue') : t('dashboard.dueSoon')} · {formatLocalDate(task.deadline, i18n.language)}
              </Badge>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}

function IdleTeamWidget() {
  const { t } = useTranslation()
  const { data: workload } = useQuery({
    queryKey: ['workload'],
    queryFn: async () => {
      const { data, error } = await supabase.from('v_employee_workload').select('*')
      if (error) throw error
      return data
    },
  })

  const idle = (workload ?? []).filter((w) => w.open_task_count === 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-medium">{t('dashboard.idleTeam')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {idle.length === 0 && <p className="text-sm text-muted-foreground">{t('dashboard.idleTeamEmpty')}</p>}
        {idle.map((w) => (
          <Badge key={w.profile_id} variant="secondary" className="w-fit">
            {w.full_name}
          </Badge>
        ))}
      </CardContent>
    </Card>
  )
}

// The management row (CEO/PM) -- reuses v_ceo_dashboard (same view the
// dedicated /kpi page reads) so the two never drift apart, but surfaced
// right on the daily-use Cabinet page instead of requiring a separate visit.
function ManagementStatsRow({ canSeeFinance }: { canSeeFinance: boolean }) {
  const { t } = useTranslation()
  const { data: dashboard } = useQuery({
    queryKey: ['v_ceo_dashboard'],
    queryFn: async () => {
      const { data, error } = await supabase.from('v_ceo_dashboard').select('*').single()
      if (error) throw error
      return data
    },
  })
  const { data: profit } = useQuery({
    queryKey: ['v_project_profit'],
    enabled: canSeeFinance,
    queryFn: async () => {
      const { data, error } = await supabase.from('v_project_profit').select('profit')
      if (error) throw error
      return data
    },
  })

  const netProfit = (profit ?? []).reduce((sum, p) => sum + Number(p.profit), 0)
  const overdueTasks = dashboard?.overdue_tasks ?? 0

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
      {canSeeFinance && <StatCard label={t('dashboard.expectedRevenue')} value={formatMoney(dashboard?.mrr ?? 0)} />}
      {canSeeFinance && <StatCard label={t('dashboard.netProfit')} value={formatMoney(netProfit)} />}
      <StatCard label={t('kpi.activeProjects')} value={dashboard?.active_projects ?? 0} />
      <StatCard label={t('kpi.overdueTasks')} value={overdueTasks} tone={overdueTasks > 0 ? 'destructive' : 'default'} />
      <StatCard label={t('kpi.overloadedEmployees')} value={dashboard?.overloaded_employees ?? 0} />
    </div>
  )
}

// Everyone's own quick stats -- the thing missing that made Cabinet feel like
// a bare task list instead of a dashboard: no numbers to glance at.
function MyStatsRow() {
  const { t } = useTranslation()
  const { profile } = useAuth()

  const { data: doneStatus } = useQuery({
    queryKey: ['task_statuses-done'],
    queryFn: async () => {
      const { data, error } = await supabase.from('task_statuses').select('id').eq('slug', 'done').maybeSingle()
      if (error) throw error
      return data
    },
  })

  const { data: myTasks } = useQuery({
    queryKey: ['dashboard-my-stats', profile?.id],
    enabled: !!profile,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select('id, deadline, status_id, completed_at')
        .eq('assignee_profile_id', profile!.id)
      if (error) throw error
      return data
    },
  })

  const doneId = doneStatus?.id
  const now = Date.now()
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000
  const openCount = (myTasks ?? []).filter((task) => task.status_id !== doneId).length
  const overdueCount = (myTasks ?? []).filter(
    (task) => task.status_id !== doneId && task.deadline && new Date(task.deadline).getTime() < now
  ).length
  const completedThisWeek = (myTasks ?? []).filter(
    (task) => task.status_id === doneId && task.completed_at && new Date(task.completed_at).getTime() >= weekAgo
  ).length

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <StatCard label={t('dashboard.myOpenTasks')} value={openCount} />
      <StatCard label={t('dashboard.myOverdue')} value={overdueCount} tone={overdueCount > 0 ? 'destructive' : 'default'} />
      <StatCard label={t('dashboard.completedThisWeek')} value={completedThisWeek} />
    </div>
  )
}

function TodayContentWidget() {
  const { t } = useTranslation()
  const today = new Date().toISOString().slice(0, 10)
  const { data: items } = useQuery({
    queryKey: ['dashboard-today-content', today],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('content_plan_items')
        .select('id, topic, publish_date')
        .eq('publish_date', today)
      if (error) throw error
      return data
    },
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-medium">{t('dashboard.todayContent')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {(items?.length ?? 0) === 0 && <p className="text-sm text-muted-foreground">{t('dashboard.todayContentEmpty')}</p>}
        {items?.map((item) => (
          <Badge key={item.id} variant="outline" className="w-fit">
            {item.topic}
          </Badge>
        ))}
      </CardContent>
    </Card>
  )
}

function TeamTasksWidget({ onOpen }: { onOpen: (id: string) => void }) {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const { data: tasks } = useQuery({
    queryKey: ['dashboard-team-tasks', profile?.id],
    enabled: !!profile,
    queryFn: async () => {
      // RLS (tasks_select_pm_scoped) already limits this to tasks in the PM's
      // own projects — no client-side project filtering needed.
      const { data, error } = await supabase
        .from('tasks')
        .select('id, title, status_id, deadline, percent_complete, assignee_profile_id')
        .neq('assignee_profile_id', profile!.id)
        .order('deadline', { ascending: true, nullsFirst: false })
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

  const taskIds = useMemo(() => (tasks ?? []).map((t) => t.id), [tasks])
  const { data: subtasksByTask } = useSubtasksBatch(taskIds)

  const assigneeName = (id: string | null) => profiles?.find((p) => p.id === id)?.full_name
  const assigneeAvatarUrl = (id: string | null) => profiles?.find((p) => p.id === id)?.avatar_url

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-medium">{t('dashboard.teamTasks')}</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {(tasks?.length ?? 0) === 0 && <p className="text-sm text-muted-foreground">{t('dashboard.teamTasksEmpty')}</p>}
        {tasks?.map((task) => (
          <TaskCard
            key={task.id}
            title={task.title}
            deadline={task.deadline}
            percentComplete={task.percent_complete}
            assigneeName={assigneeName(task.assignee_profile_id)}
            assigneeAvatarUrl={assigneeAvatarUrl(task.assignee_profile_id)}
            subtasks={subtasksByTask?.get(task.id)}
            onOpen={() => onOpen(task.id)}
          />
        ))}
      </CardContent>
    </Card>
  )
}

function TelegramConnectCard() {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const queryClient = useQueryClient()

  const { data: links } = useQuery({
    queryKey: ['my-telegram-links', profile?.id],
    enabled: !!profile,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profile_telegram_links')
        .select('id, telegram_label, linked_at')
        .eq('profile_id', profile!.id)
        .order('linked_at', { ascending: false })
      if (error) throw error
      return data
    },
  })

  const unlinkMutation = useMutation({
    mutationFn: async (linkId: string) => {
      const { error } = await supabase.from('profile_telegram_links').delete().eq('id', linkId)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['my-telegram-links', profile?.id] }),
    onError: (err: Error) => toast.error(err.message),
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-medium">{t('cabinet.telegramTitle')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {links && links.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            {links.map((link) => (
              <div key={link.id} className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Badge variant="default">{t('team.telegramConnected')}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {link.telegram_label ?? t('cabinet.telegramUnknownAccount')}
                  </span>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7"
                  disabled={unlinkMutation.isPending}
                  onClick={() => unlinkMutation.mutate(link.id)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <Badge variant="secondary" className="w-fit">
            {t('team.telegramNotConnected')}
          </Badge>
        )}
        {profile && (
          <>
            <p className="text-xs text-muted-foreground">{t('cabinet.telegramInstructions')}</p>
            <Button size="sm" className="w-fit" render={<a href={telegramDeepLink(profile.id)} target="_blank" rel="noreferrer" />}>
              {t('cabinet.telegramConnectButton')}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}

export function CabinetPage() {
  const { t } = useTranslation()
  const { profile, hasCapability } = useAuth()
  // Capability-based, not role-slug-based: matches the actual data scoping
  // (cabinets.read_all) rather than assuming only literally-named
  // 'ceo'/'pm' roles can ever hold team-management responsibilities.
  const canSeeTeamWidgets = hasCapability('cabinets.read_all')
  // "Team tasks" widget below relies on tasks_select_pm_scoped RLS (PM of at
  // least one project) -- projects.manage is the matching capability, not
  // the 'pm' role slug.
  const isPm = hasCapability('projects.manage')
  const canSeeFinance = hasCapability('finance.read') || hasCapability('finance.write')
  const [openTaskId, setOpenTaskId] = useState<string | null>(null)

  const { data: tasks, isLoading } = useQuery({
    queryKey: ['cabinet-tasks', profile?.id],
    enabled: !!profile,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_task_queue')
        .select('*')
        .eq('assignee_profile_id', profile!.id)
        .order('sort_score', { ascending: false })
        .order('deadline', { ascending: true, nullsFirst: false })
      if (error) throw error
      return data
    },
  })

  const taskIds = useMemo(() => (tasks ?? []).map((t) => t.id), [tasks])
  const { data: subtasksByTask } = useSubtasksBatch(taskIds)

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-4xl font-bold tracking-tight">{t('cabinet.title')}</h1>
        <p className="text-sm text-muted-foreground">{profile?.full_name}</p>
      </div>

      <MyStatsRow />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TimeTrackerWidget />
        <TelegramConnectCard />
      </div>

      {canSeeTeamWidgets && (
        <>
          <ManagementStatsRow canSeeFinance={canSeeFinance} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <DeadlinesWidget />
            <IdleTeamWidget />
            <TodayContentWidget />
          </div>
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">{t('cabinet.myTasks')}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {isLoading && <p className="text-sm text-muted-foreground">{t('common.loading')}...</p>}
          {!isLoading && (tasks?.length ?? 0) === 0 && (
            <p className="text-sm text-muted-foreground">{t('cabinet.empty')}</p>
          )}
          {tasks?.map((task) => (
            <TaskCard
              key={task.id}
              title={task.title}
              deadline={task.deadline}
              percentComplete={task.percent_complete}
              subtasks={subtasksByTask?.get(task.id)}
              onOpen={() => setOpenTaskId(task.id)}
            />
          ))}
        </CardContent>
      </Card>

      {isPm && <TeamTasksWidget onOpen={setOpenTaskId} />}

      <TaskSheet
        open={!!openTaskId}
        onOpenChange={(open) => !open && setOpenTaskId(null)}
        taskId={openTaskId}
      />
    </div>
  )
}
