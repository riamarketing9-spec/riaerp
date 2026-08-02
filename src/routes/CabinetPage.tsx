import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/auth/AuthProvider'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar } from '@/components/Avatar'
import { TaskSheet } from './TaskSheet'
import { ContentItemSheet } from './ContentItemSheet'
import { TaskCard, type TaskCardSubtask } from '@/components/TaskCard'
import { formatLocalDate, pickLabel } from '@/lib/localizedLabel'
import { Button } from '@/components/ui/button'
import { Trash2, Plus } from 'lucide-react'
import { telegramDeepLink } from '@/lib/telegram'
import { TimeTrackerWidget } from '@/components/TimeTrackerWidget'
import { TaskStatusChart, type TaskStatusBucket } from '@/components/charts/TaskStatusChart'
import { ProjectTasksChart, type ProjectTaskBar } from '@/components/charts/ProjectTasksChart'
import { ProjectProfitChart } from '@/components/charts/ProjectProfitChart'
import { RevenueProfitChart } from '@/components/charts/RevenueProfitChart'
import { ExpenseDonutChart } from '@/components/charts/ExpenseDonutChart'
import { BackupExportButton } from './BackupExportButton'
import { cn } from '@/lib/utils'

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
        .select('id, task_id, title, is_done, sort_order, created_at, completed_at')
        .in('task_id', taskIds)
        .order('sort_order')
      if (error) throw error
      const map = new Map<string, TaskCardSubtask[]>()
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
}

function useToggleSubtask() {
  const queryClient = useQueryClient()
  return useMutation({
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
      queryClient.invalidateQueries({ queryKey: ['recurring-checklist-tasks'] })
    },
    onError: (err: Error) => toast.error(err.message),
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

  // Done tasks keep their (now-irrelevant) past deadline forever -- without
  // this filter, a finished task sits in "overdue" permanently, which reads
  // as "you're behind" on work that's actually done. NOT excluding
  // "backlog" here: in this org that slug is relabeled to mean "new task",
  // not "someday/icebox", so filtering it out hid genuinely active work.
  const doneId = statuses?.find((s) => s.slug === 'done')?.id
  const tasks = rawTasks?.filter((tsk) => tsk.status_id !== doneId)

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

// Was a plain vertical Badge-per-name list -- grew tall the moment more than
// a couple of people were free. A single filled bar (free / total, click to
// reveal names as compact chips) says the same thing in a fraction of the
// space and reads as a chart at a glance, not a list.
function IdleTeamWidget() {
  const { t } = useTranslation()
  const [showList, setShowList] = useState(false)
  const { data: workload } = useQuery({
    queryKey: ['workload'],
    queryFn: async () => {
      const { data, error } = await supabase.from('v_employee_workload').select('*')
      if (error) throw error
      return data
    },
  })

  const total = workload?.length ?? 0
  const idle = (workload ?? []).filter((w) => w.open_task_count === 0)
  const idlePct = total > 0 ? Math.round((idle.length / total) * 100) : 0

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-medium">{t('dashboard.idleTeam')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <button
          type="button"
          className="flex w-full flex-col gap-1.5 text-left"
          onClick={() => setShowList((v) => !v)}
          aria-expanded={showList}
        >
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {t('dashboard.idleTeamFree')}: <span className="font-medium text-foreground">{idle.length}</span>
            </span>
            <span>
              {t('dashboard.idleTeamTotal')}: <span className="font-medium text-foreground">{total}</span>
            </span>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-brand-500 transition-[width]" style={{ width: `${idlePct}%` }} />
          </div>
        </button>

        {showList &&
          (idle.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('dashboard.idleTeamEmpty')}</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {idle.map((w) => (
                <div
                  key={w.profile_id}
                  className="flex items-center gap-1.5 rounded-full bg-muted px-2 py-1 text-xs"
                >
                  <Avatar name={w.full_name} className="size-5 rounded-full text-[9px]" />
                  {w.full_name}
                </div>
              ))}
            </div>
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

// Today's attendance at a glance -- every active employee, whether they've
// clocked in yet, and their start/end time if so. Separate from
// IdleTeamWidget above (that one's about open task count, not attendance).
function AttendanceTodayWidget() {
  const { t, i18n } = useTranslation()
  const todayBounds = useMemo(() => {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    const end = new Date(start)
    end.setDate(end.getDate() + 1)
    return { start, end }
  }, [])

  const { data: profiles } = useQuery({
    queryKey: ['profiles-lookup-active'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('id, full_name').is('deleted_at', null)
      if (error) throw error
      return data
    },
  })

  const { data: entries } = useQuery({
    queryKey: ['attendance-today-widget', todayBounds.start.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('time_entries')
        .select('profile_id, started_at, ended_at')
        .or(`and(started_at.gte.${todayBounds.start.toISOString()},started_at.lt.${todayBounds.end.toISOString()}),ended_at.is.null`)
        .order('started_at', { ascending: true })
      if (error) throw error
      return data
    },
    refetchInterval: 60_000,
  })

  const entryFor = (profileId: string) => entries?.find((e) => e.profile_id === profileId)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-medium">{t('attendance.todayTitle')}</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {profiles?.map((p) => {
          const entry = entryFor(p.id)
          const working = !!entry && !entry.ended_at
          return (
            <div
              key={p.id}
              className={cn(
                'flex items-center justify-between gap-2 rounded-md px-2 py-1.5 transition-colors',
                working ? 'bg-brand-50 dark:bg-brand-500/10' : 'bg-muted/30'
              )}
            >
              <span className="flex items-center gap-1.5 text-sm">
                {working && <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-brand-500" />}
                {p.full_name}
              </span>
              {entry ? (
                <span className="shrink-0 text-xs text-muted-foreground">
                  {new Date(entry.started_at).toLocaleTimeString(i18n.language.startsWith('uz') ? 'uz-Latn-UZ' : 'ru-RU', {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false,
                  })}
                  {' – '}
                  {entry.ended_at
                    ? new Date(entry.ended_at).toLocaleTimeString(i18n.language.startsWith('uz') ? 'uz-Latn-UZ' : 'ru-RU', {
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false,
                      })
                    : t('attendance.working')}
                </span>
              ) : (
                <Badge variant="secondary" className="shrink-0 text-[10px]">
                  {t('attendance.notArrived')}
                </Badge>
              )}
            </div>
          )
        })}
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
      // Unfiltered: this resolves assignee names on existing tasks/content
      // items, including ones assigned to someone since removed from the
      // team -- filtering here would blank out their name instead of
      // showing it.
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
        .select('id, topic, project_id, publish_date, status_id, shooter_profile_id, editor_profile_id, smm_profile_id')
        .neq('status_id', publishedStatusId!)
      if (!seesTeamAggregate) {
        query = query.or(
          `shooter_profile_id.eq.${profile!.id},editor_profile_id.eq.${profile!.id},smm_profile_id.eq.${profile!.id}`
        )
      }
      const { data, error } = await query
      if (error) throw error
      return data
    },
  })

  // NOT excluding "backlog" here: in this org that status slug is relabeled
  // to mean "new task" (Yangi vazifa), not "someday/icebox" -- filtering it
  // out was hiding every freshly created task from these charts.
  const doneId = statuses?.find((s) => s.slug === 'done')?.id
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

  const openTasks = (tasks ?? []).filter((tsk) => tsk.status_id !== doneId)
  const overdueTasks = openTasks.filter((tsk) => tsk.deadline && new Date(tsk.deadline).getTime() < now)
  const dueSoonTasks = openTasks.filter(
    (tsk) => tsk.deadline && new Date(tsk.deadline).getTime() >= now && new Date(tsk.deadline).getTime() <= soon
  )

  // Status semantics, not a monochrome ramp: overdue must read as the
  // alarming one at a glance, which a pale green never did (the lightest
  // color in a ramp reads as "least important", the opposite of the intent).
  const buckets: TaskStatusBucket[] = [
    { key: 'in_progress', label: t('dashboard.inProgress'), count: openTasks.length, color: 'var(--color-brand-500)', tasks: toBucketTasks(openTasks) },
    { key: 'due_soon', label: t('dashboard.dueSoon'), count: dueSoonTasks.length, color: 'var(--color-amber-accent)', tasks: toBucketTasks(dueSoonTasks) },
    { key: 'overdue', label: t('dashboard.overdue'), count: overdueTasks.length, color: 'var(--destructive)', tasks: toBucketTasks(overdueTasks) },
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
    const smm = assigneeName(item.smm_profile_id) ?? '—'
    return `${t('contentPlan.shooter')}: ${shooter} · ${t('contentPlan.editor')}: ${editor} · ${t('contentPlan.smm')}: ${smm}`
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
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
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
          <ProjectTasksChart bars={contentBars} color="var(--color-sky-accent)" onItemClick={onContentClick} />
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

      <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
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

// Was a grid of full TaskCards -- for a PM skimming everyone else's load,
// a per-employee bar (count of open team tasks, click to drill into the
// list) reads faster than a wall of cards and matches the chart style used
// elsewhere on this page.
function TeamTasksWidget({ onOpen }: { onOpen: (id: string) => void }) {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const { data: statuses } = useQuery({
    queryKey: ['task_statuses-lookup'],
    queryFn: async () => {
      const { data, error } = await supabase.from('task_statuses').select('id, slug')
      if (error) throw error
      return data
    },
  })

  const { data: rawTasks } = useQuery({
    queryKey: ['dashboard-team-tasks', profile?.id],
    enabled: !!profile,
    queryFn: async () => {
      // RLS (tasks_select_pm_scoped) already limits this to tasks in the PM's
      // own projects — no client-side project filtering needed.
      const { data, error } = await supabase
        .from('tasks')
        .select('id, title, status_id, deadline, assignee_profile_id, project_id')
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

  const { data: projects } = useQuery({
    queryKey: ['projects-lookup-names'],
    queryFn: async () => {
      const { data, error } = await supabase.from('projects').select('id, name')
      if (error) throw error
      return data
    },
  })

  // Done tasks don't belong on a "keep an eye on the team" widget. NOT
  // excluding "backlog" here: in this org that slug means "new task", not
  // "someday/icebox" -- filtering it out hid genuinely active work.
  const doneId = statuses?.find((s) => s.slug === 'done')?.id
  const tasks = rawTasks?.filter((tsk) => tsk.status_id !== doneId)

  const assigneeName = (id: string | null) => profiles?.find((p) => p.id === id)?.full_name ?? '—'
  const projectName = (id: string | null) => projects?.find((p) => p.id === id)?.name ?? null

  const bars: ProjectTaskBar[] = useMemo(() => {
    const map = new Map<string, NonNullable<typeof tasks>>()
    for (const tsk of tasks ?? []) {
      if (!tsk.assignee_profile_id) continue
      const list = map.get(tsk.assignee_profile_id) ?? []
      list.push(tsk)
      map.set(tsk.assignee_profile_id, list)
    }
    return [...map.entries()]
      .map(([assigneeId, list]) => ({
        projectId: assigneeId,
        projectName: assigneeName(assigneeId),
        count: list.length,
        tasks: list.slice(0, 20).map((tsk) => ({
          id: tsk.id,
          title: tsk.title,
          deadline: tsk.deadline,
          subtitle: projectName(tsk.project_id),
        })),
      }))
      .sort((a, b) => b.count - a.count)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, profiles, projects])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-medium">{t('dashboard.teamTasks')}</CardTitle>
      </CardHeader>
      <CardContent>
        {bars.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('dashboard.teamTasksEmpty')}</p>
        ) : (
          <ProjectTasksChart bars={bars} onItemClick={onOpen} />
        )}
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

// The recurring-task "checklist" view: daily/weekly/monthly/one-time tasks
// filtered by recurrence type, in a row of toggle buttons rather than a
// dropdown (matches the same picker style used on the task card itself).
// PM/CEO see everyone's; a plain employee sees only their own (mirrors
// tasks_select_own RLS -- the team-wide query would just come back empty
// for them anyway, this only avoids the wasted request).
function RecurringChecklistWidget({
  teamWide,
  onOpen,
}: {
  teamWide: boolean
  onOpen: (id: string) => void
}) {
  const { t, i18n } = useTranslation()
  const { profile, hasCapability } = useAuth()
  const showSubtaskDuration = hasCapability('org.full_access') || hasCapability('projects.manage')
  const [filterSlug, setFilterSlug] = useState<string | null>(null)
  const [creatingOpen, setCreatingOpen] = useState(false)
  const toggleSubtask = useToggleSubtask()

  const { data: recurrenceTypes } = useQuery({
    queryKey: ['recurrence_types'],
    queryFn: async () => {
      const { data, error } = await supabase.from('recurrence_types').select('id, slug, label_ru, label_uz')
      if (error) throw error
      return data
    },
  })

  const { data: statuses } = useQuery({
    queryKey: ['task_statuses-lookup'],
    queryFn: async () => {
      const { data, error } = await supabase.from('task_statuses').select('id, slug')
      if (error) throw error
      return data
    },
  })

  const { data: tasks, isLoading } = useQuery({
    queryKey: ['recurring-checklist-tasks', teamWide, profile?.id],
    enabled: !!profile,
    queryFn: async () => {
      let query = supabase
        .from('tasks')
        .select('id, title, status_id, deadline, percent_complete, recurrence_id, assignee_profile_id')
        .not('recurrence_id', 'is', null)
        .order('deadline', { ascending: true, nullsFirst: false })
      if (!teamWide) query = query.eq('assignee_profile_id', profile!.id)
      const { data, error } = await query
      if (error) throw error
      return data
    },
  })

  const { data: profiles } = useQuery({
    queryKey: ['profiles-lookup'],
    enabled: teamWide,
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('id, full_name')
      if (error) throw error
      return data
    },
  })

  const taskIds = useMemo(() => (tasks ?? []).map((tsk) => tsk.id), [tasks])
  const { data: subtasksByTask } = useSubtasksBatch(taskIds)

  const doneId = statuses?.find((s) => s.slug === 'done')?.id
  const statusSlugOf = (id: string) => statuses?.find((s) => s.id === id)?.slug
  const assigneeName = (id: string | null) => profiles?.find((p) => p.id === id)?.full_name ?? undefined

  // One-time tasks drop off the list once done (they don't respawn, so
  // there's nothing left to track); recurring ones stay visible so the
  // just-completed instance and its freshly spawned successor are both
  // seen briefly.
  const visibleTasks = (tasks ?? []).filter((tsk) => {
    if (filterSlug && recurrenceTypes?.find((r) => r.id === tsk.recurrence_id)?.slug !== filterSlug) return false
    const recSlug = recurrenceTypes?.find((r) => r.id === tsk.recurrence_id)?.slug
    if (recSlug === 'one_time' && tsk.status_id === doneId) return false
    return true
  })

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base font-medium">{t('tasks.checklist')}</CardTitle>
        <Button size="sm" variant="outline" onClick={() => setCreatingOpen(true)}>
          <Plus className="size-3.5" />
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setFilterSlug(null)}
            className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors ${
              filterSlug === null
                ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200'
                : 'border-border text-muted-foreground hover:bg-muted'
            }`}
          >
            {t('common.all')}
          </button>
          {recurrenceTypes?.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setFilterSlug(r.slug)}
              className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors ${
                filterSlug === r.slug
                  ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200'
                  : 'border-border text-muted-foreground hover:bg-muted'
              }`}
            >
              {pickLabel(r, i18n.language)}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {isLoading && <p className="text-sm text-muted-foreground">{t('common.loading')}...</p>}
          {!isLoading && visibleTasks.length === 0 && (
            <p className="text-sm text-muted-foreground">{t('cabinet.empty')}</p>
          )}
          {visibleTasks.map((tsk) => (
            <TaskCard
              key={tsk.id}
              title={tsk.title}
              statusSlug={statusSlugOf(tsk.status_id)}
              deadline={tsk.deadline}
              percentComplete={tsk.percent_complete}
              subtasks={subtasksByTask?.get(tsk.id)}
              assigneeName={teamWide ? assigneeName(tsk.assignee_profile_id) : undefined}
              onOpen={() => onOpen(tsk.id)}
              onToggleSubtask={(id, done) => toggleSubtask.mutate({ id, is_done: done })}
              showSubtaskDuration={showSubtaskDuration}
            />
          ))}
        </div>
      </CardContent>

      <TaskSheet open={creatingOpen} onOpenChange={setCreatingOpen} taskId={null} />
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
  const showSubtaskDuration = hasCapability('org.full_access') || isPm
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

  const { data: myTaskStatuses } = useQuery({
    queryKey: ['task_statuses-lookup'],
    queryFn: async () => {
      const { data, error } = await supabase.from('task_statuses').select('id, slug')
      if (error) throw error
      return data
    },
  })
  const myTaskStatusSlug = (id: string) => myTaskStatuses?.find((s) => s.id === id)?.slug

  const taskIds = useMemo(() => (tasks ?? []).map((t) => t.id), [tasks])
  const { data: subtasksByTask } = useSubtasksBatch(taskIds)
  const toggleSubtask = useToggleSubtask()

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
        <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
          <DeadlinesWidget />
          <IdleTeamWidget />
          <TodayContentWidget />
          <div className="sm:col-span-2">
            <AttendanceTodayWidget />
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">{t('cabinet.myTasks')}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {isLoading && <p className="text-sm text-muted-foreground">{t('common.loading')}...</p>}
          {!isLoading && (tasks?.length ?? 0) === 0 && (
            <p className="text-sm text-muted-foreground">{t('cabinet.empty')}</p>
          )}
          {tasks?.map((task) => (
            <TaskCard
              key={task.id}
              title={task.title}
              statusSlug={myTaskStatusSlug(task.status_id)}
              deadline={task.deadline}
              percentComplete={task.percent_complete}
              subtasks={subtasksByTask?.get(task.id)}
              onOpen={() => setOpenTaskId(task.id)}
              onToggleSubtask={(id, done) => toggleSubtask.mutate({ id, is_done: done })}
              showSubtaskDuration={showSubtaskDuration}
            />
          ))}
        </CardContent>
      </Card>

      <RecurringChecklistWidget teamWide={canSeeTeamWidgets || isPm} onOpen={setOpenTaskId} />

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
