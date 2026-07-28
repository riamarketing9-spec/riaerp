import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/auth/AuthProvider'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { TaskSheet } from './TaskSheet'
import { ContentItemSheet } from './ContentItemSheet'
import { TaskCard, type TaskCardSubtask } from '@/components/TaskCard'
import { formatLocalDate, pickLabel } from '@/lib/localizedLabel'
import { Button } from '@/components/ui/button'
import { Trash2 } from 'lucide-react'
import { telegramDeepLink } from '@/lib/telegram'
import { TimeTrackerWidget } from '@/components/TimeTrackerWidget'
import { TaskStatusChart, type TaskStatusBucket } from '@/components/charts/TaskStatusChart'
import { ProjectTasksChart, type ProjectTaskBar } from '@/components/charts/ProjectTasksChart'
import { ProjectProfitChart } from '@/components/charts/ProjectProfitChart'
import { RevenueProfitChart } from '@/components/charts/RevenueProfitChart'
import { ExpenseDonutChart } from '@/components/charts/ExpenseDonutChart'
import { BackupExportButton } from './BackupExportButton'

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
  const { data: statuses } = useQuery({
    queryKey: ['task_statuses-lookup'],
    queryFn: async () => {
      const { data, error } = await supabase.from('task_statuses').select('id, slug')
      if (error) throw error
      return data
    },
  })

  const { data: rawTasks } = useQuery({
    queryKey: ['dashboard-deadlines'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_task_queue')
        .select('id, title, deadline, assignee_profile_id, status_id')
        .not('deadline', 'is', null)
        .lte('deadline', new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString())
        .order('deadline', { ascending: true })
      if (error) throw error
      return data
    },
  })

  // Done/backlog tasks keep their (now-irrelevant) past deadline forever --
  // without this filter, a finished task sits in "overdue" permanently,
  // which reads as "you're behind" on work that's actually done.
  const doneId = statuses?.find((s) => s.slug === 'done')?.id
  const backlogId = statuses?.find((s) => s.slug === 'backlog')?.id
  const tasks = rawTasks?.filter((tsk) => tsk.status_id !== doneId && tsk.status_id !== backlogId)

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

// Replaces the old plain stat-card tiles: a status-colored bar chart (open /
// overdue / due-soon) and a per-project bar list, both personal for a plain
// employee but switching to the team-wide aggregate for CEO/PM -- one view,
// not both stacked. Clicking a bar/segment expands the matching task list
// inline, which doubles as the accessible "table view" for the chart.
function TaskChartsSection({
  onTaskClick,
  onContentClick,
}: {
  onTaskClick: (id: string) => void
  onContentClick: (id: string) => void
}) {
  const { t } = useTranslation()
  const { profile, hasCapability } = useAuth()
  const seesTeamAggregate = hasCapability('cabinets.read_all') || hasCapability('projects.manage')

  const { data: statuses } = useQuery({
    queryKey: ['task_statuses-lookup'],
    queryFn: async () => {
      const { data, error } = await supabase.from('task_statuses').select('id, slug')
      if (error) throw error
      return data
    },
  })

  const { data: tasks } = useQuery({
    queryKey: ['dashboard-task-charts', seesTeamAggregate, profile?.id],
    enabled: !!profile,
    queryFn: async () => {
      let query = supabase
        .from('v_task_queue')
        .select('id, title, deadline, status_id, project_id, assignee_profile_id')
      if (!seesTeamAggregate) query = query.eq('assignee_profile_id', profile!.id)
      const { data, error } = await query
      if (error) throw error
      return data
    },
  })

  const { data: projects } = useQuery({
    queryKey: ['projects-lookup-names'],
    queryFn: async () => {
      const { data, error } = await supabase.from('projects').select('id, name')
      if (error) throw error
      return data
    },
  })

  const { data: profiles } = useQuery({
    queryKey: ['profiles-lookup'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('id, full_name')
      if (error) throw error
      return data
    },
  })

  const { data: contentStatuses } = useQuery({
    queryKey: ['content_statuses-lookup'],
    queryFn: async () => {
      const { data, error } = await supabase.from('content_statuses').select('id, slug')
      if (error) throw error
      return data
    },
  })

  const publishedStatusId = contentStatuses?.find((s) => s.slug === 'published')?.id

  const { data: contentItems } = useQuery({
    queryKey: ['dashboard-content-charts', seesTeamAggregate, profile?.id, publishedStatusId],
    enabled: !!profile && !!publishedStatusId,
    queryFn: async () => {
      let query = supabase
        .from('content_plan_items')
        .select('id, topic, project_id, publish_date, status_id, shooter_profile_id, editor_profile_id')
        .neq('status_id', publishedStatusId!)
      if (!seesTeamAggregate) {
        query = query.or(`shooter_profile_id.eq.${profile!.id},editor_profile_id.eq.${profile!.id}`)
      }
      const { data, error } = await query
      if (error) throw error
      return data
    },
  })

  const doneId = statuses?.find((s) => s.slug === 'done')?.id
  const backlogId = statuses?.find((s) => s.slug === 'backlog')?.id
  const now = Date.now()
  const soon = now + 3 * 24 * 60 * 60 * 1000

  const assigneeName = (id: string | null) => profiles?.find((p) => p.id === id)?.full_name ?? null
  const projectName = (id: string | null) => projects?.find((p) => p.id === id)?.name ?? null

  const toBucketTasks = (list: NonNullable<typeof tasks>) =>
    list.slice(0, 20).map((tsk) => ({
      id: tsk.id,
      title: tsk.title,
      deadline: tsk.deadline,
      subtitle: seesTeamAggregate
        ? [assigneeName(tsk.assignee_profile_id), projectName(tsk.project_id)].filter(Boolean).join(' · ') || null
        : null,
    }))

  const openTasks = (tasks ?? []).filter((tsk) => tsk.status_id !== doneId && tsk.status_id !== backlogId)
  const overdueTasks = openTasks.filter((tsk) => tsk.deadline && new Date(tsk.deadline).getTime() < now)
  const dueSoonTasks = openTasks.filter(
    (tsk) => tsk.deadline && new Date(tsk.deadline).getTime() >= now && new Date(tsk.deadline).getTime() <= soon
  )

  // Monochrome brand-green ramp instead of blue/red/amber: dark green reads
  // as the healthy state (in progress), pale green flags what needs
  // attention (overdue) -- matches the ERP's own palette rather than a
  // generic traffic-light scheme.
  const buckets: TaskStatusBucket[] = [
    { key: 'in_progress', label: t('dashboard.inProgress'), count: openTasks.length, color: '#0a4235', tasks: toBucketTasks(openTasks) },
    { key: 'due_soon', label: t('dashboard.dueSoon'), count: dueSoonTasks.length, color: '#468f76', tasks: toBucketTasks(dueSoonTasks) },
    { key: 'overdue', label: t('dashboard.overdue'), count: overdueTasks.length, color: '#a3c9bc', tasks: toBucketTasks(overdueTasks) },
  ]

  const projectBars: ProjectTaskBar[] = useMemo(() => {
    const map = new Map<string, NonNullable<typeof tasks>>()
    for (const tsk of openTasks) {
      if (!tsk.project_id) continue
      const list = map.get(tsk.project_id) ?? []
      list.push(tsk)
      map.set(tsk.project_id, list)
    }
    return [...map.entries()]
      .map(([projectId, list]) => ({
        projectId,
        projectName: projects?.find((p) => p.id === projectId)?.name ?? '—',
        count: list.length,
        tasks: toBucketTasks(list),
      }))
      .sort((a, b) => b.count - a.count)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openTasks, projects])

  // Always show both roles, even unassigned ("—") -- silently omitting the
  // line when shooter/editor are empty looked like the feature was missing
  // rather than the item just not having anyone assigned yet.
  const contentSubtitle = (item: NonNullable<typeof contentItems>[number]) => {
    const shooter = assigneeName(item.shooter_profile_id) ?? '—'
    const editor = assigneeName(item.editor_profile_id) ?? '—'
    return `${t('contentPlan.shooter')}: ${shooter} · ${t('contentPlan.editor')}: ${editor}`
  }

  const contentBars: ProjectTaskBar[] = useMemo(() => {
    const map = new Map<string, NonNullable<typeof contentItems>>()
    for (const item of contentItems ?? []) {
      const list = map.get(item.project_id) ?? []
      list.push(item)
      map.set(item.project_id, list)
    }
    return [...map.entries()]
      .map(([projectId, list]) => ({
        projectId,
        projectName: projects?.find((p) => p.id === projectId)?.name ?? '—',
        count: list.length,
        tasks: list.slice(0, 20).map((item) => ({
          id: item.id,
          title: item.topic,
          deadline: item.publish_date,
          subtitle: contentSubtitle(item),
        })),
      }))
      .sort((a, b) => b.count - a.count)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentItems, projects])

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">
            {seesTeamAggregate ? t('dashboard.taskStatusChartTeam') : t('dashboard.taskStatusChart')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <TaskStatusChart buckets={buckets} onItemClick={onTaskClick} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">{t('dashboard.byProjectChart')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ProjectTasksChart bars={projectBars} onItemClick={onTaskClick} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">
            {seesTeamAggregate ? t('dashboard.contentPlanChartTeam') : t('dashboard.contentPlanChart')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Same bar-list type as "по проектам" but a different shade -- a
              donut/pie stops being readable once there are more than a
              handful of projects, since every slice needs its own hue. */}
          <ProjectTasksChart bars={contentBars} color="#468f76" onItemClick={onContentClick} />
        </CardContent>
      </Card>
    </div>
  )
}

const TREND_MONTHS = 6

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// Moved in from the retired /kpi page: same charts, same queries, now living
// where the CEO already spends their time instead of a separate visit.
function FinanceSection() {
  const { t, i18n } = useTranslation()

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
    queryFn: async () => {
      const { data, error } = await supabase.from('v_project_profit').select('*')
      if (error) throw error
      return data
    },
  })

  const sinceDate = useMemo(() => {
    const d = new Date()
    d.setMonth(d.getMonth() - (TREND_MONTHS - 1))
    d.setDate(1)
    return d
  }, [])

  const { data: revenueRows } = useQuery({
    queryKey: ['finance_project_revenue-trend', sinceDate.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('finance_project_revenue')
        .select('month, amount')
        .gte('month', sinceDate.toISOString().slice(0, 10))
      if (error) throw error
      return data
    },
  })

  const { data: expenseRows } = useQuery({
    queryKey: ['finance_expenses-trend', sinceDate.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('finance_expenses')
        .select('expense_date, amount')
        .gte('expense_date', sinceDate.toISOString().slice(0, 10))
      if (error) throw error
      return data
    },
  })

  const months = useMemo(() => {
    const list: { key: string; date: Date }[] = []
    for (let i = TREND_MONTHS - 1; i >= 0; i--) {
      const d = new Date(sinceDate)
      d.setMonth(d.getMonth() + (TREND_MONTHS - 1 - i))
      list.push({ key: monthKey(d), date: d })
    }
    return list
  }, [sinceDate])

  const chartData = useMemo(() => {
    const revenueByMonth = new Map<string, number>()
    for (const r of revenueRows ?? []) {
      const k = monthKey(new Date(r.month))
      revenueByMonth.set(k, (revenueByMonth.get(k) ?? 0) + Number(r.amount))
    }
    const expenseByMonth = new Map<string, number>()
    for (const e of expenseRows ?? []) {
      const k = monthKey(new Date(e.expense_date))
      expenseByMonth.set(k, (expenseByMonth.get(k) ?? 0) + Number(e.amount))
    }
    return months.map(({ key, date }) => {
      const revenue = revenueByMonth.get(key) ?? 0
      const expenses = expenseByMonth.get(key) ?? 0
      return {
        monthLabel: date.toLocaleDateString(i18n.language.startsWith('uz') ? 'uz-Latn-UZ' : 'ru-RU', { month: 'short' }),
        revenue,
        profit: revenue - expenses,
      }
    })
  }, [months, revenueRows, expenseRows, i18n.language])

  const monthStart = useMemo(() => {
    const d = new Date()
    d.setDate(1)
    return d.toISOString().slice(0, 10)
  }, [])

  const { data: expensesByCategory } = useQuery({
    queryKey: ['finance_expenses-by-category', monthStart],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('finance_expenses')
        .select('amount, category_id')
        .gte('expense_date', monthStart)
      if (error) throw error
      return data
    },
  })

  const { data: categories } = useQuery({
    queryKey: ['expense_categories'],
    queryFn: async () => {
      const { data, error } = await supabase.from('expense_categories').select('id, label_ru, label_uz')
      if (error) throw error
      return data
    },
  })

  const slices = useMemo(() => {
    const byCategory = new Map<string, number>()
    for (const e of expensesByCategory ?? []) {
      const key = e.category_id ?? '__none__'
      byCategory.set(key, (byCategory.get(key) ?? 0) + Number(e.amount))
    }
    const withLabels = [...byCategory.entries()].map(([id, value]) => ({
      label: id === '__none__' ? t('kpi.otherCategory') : pickLabel(categories?.find((c) => c.id === id), i18n.language) ?? t('kpi.otherCategory'),
      value,
    }))
    withLabels.sort((a, b) => b.value - a.value)
    const top = withLabels.slice(0, 3)
    const rest = withLabels.slice(3).reduce((sum, s) => sum + s.value, 0)
    if (rest > 0) top.push({ label: t('kpi.otherCategory'), value: rest })
    return top
  }, [expensesByCategory, categories, i18n.language, t])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">{t('dashboard.finance')}</h2>
        <BackupExportButton />
      </div>

      <p className="text-xs text-muted-foreground">
        {t('kpi.mrr')}: <span className="font-medium text-foreground">{formatMoney(dashboard?.mrr ?? 0)}</span>
        {' · '}
        {t('kpi.activeProjects')}: <span className="font-medium text-foreground">{dashboard?.active_projects ?? 0}</span>
        {' · '}
        {t('kpi.overdueTasks')}: <span className="font-medium text-foreground">{dashboard?.overdue_tasks ?? 0}</span>
        {' · '}
        {t('kpi.overloadedEmployees')}: <span className="font-medium text-foreground">{dashboard?.overloaded_employees ?? 0}</span>
      </p>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">{t('kpi.revenueProfitTrend')}</CardTitle>
          </CardHeader>
          <CardContent>
            <RevenueProfitChart
              data={chartData}
              revenueLabel={t('kpi.mrr')}
              profitLabel={t('dashboard.netProfit')}
              tableToggleLabel={t('dashboard.showTable')}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">{t('kpi.expenseBreakdown')}</CardTitle>
          </CardHeader>
          <CardContent>
            {slices.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('kpi.expenseBreakdownEmpty')}</p>
            ) : (
              <ExpenseDonutChart slices={slices} totalLabel={t('kpi.totalExpenses')} tableToggleLabel={t('dashboard.showTable')} />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">{t('kpi.projectProfit')}</CardTitle>
          </CardHeader>
          <CardContent>
            {(profit?.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">{t('kpi.expenseBreakdownEmpty')}</p>
            ) : (
              <ProjectProfitChart
                data={(profit ?? []).map((p) => ({ projectId: p.project_id, name: p.name, profit: p.profit }))}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
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
  const [openContentItemId, setOpenContentItemId] = useState<string | null>(null)

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

      <TaskChartsSection onTaskClick={setOpenTaskId} onContentClick={setOpenContentItemId} />

      {canSeeFinance && <FinanceSection />}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TimeTrackerWidget />
        <TelegramConnectCard />
      </div>

      {canSeeTeamWidgets && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <DeadlinesWidget />
          <IdleTeamWidget />
          <TodayContentWidget />
        </div>
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
      <ContentItemSheet
        open={!!openContentItemId}
        onOpenChange={(open) => !open && setOpenContentItemId(null)}
        itemId={openContentItemId}
      />
    </div>
  )
}
