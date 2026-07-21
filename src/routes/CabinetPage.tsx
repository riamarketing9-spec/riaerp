import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/auth/AuthProvider'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { PeriodicChecklist } from './PeriodicChecklist'
import { formatLocalDate } from '@/lib/localizedLabel'

function formatMoney(n: number) {
  return new Intl.NumberFormat('ru-RU').format(n)
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

function FinanceWidget() {
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
    queryFn: async () => {
      const { data, error } = await supabase.from('v_project_profit').select('profit')
      if (error) throw error
      return data
    },
  })

  const netProfit = (profit ?? []).reduce((sum, p) => sum + Number(p.profit), 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-medium">{t('dashboard.finance')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">
          {t('dashboard.expectedRevenue')}: <span className="font-medium text-foreground">{formatMoney(dashboard?.mrr ?? 0)}</span>
        </p>
        <p className="text-sm text-muted-foreground">
          {t('dashboard.netProfit')}: <span className="font-medium text-foreground">{formatMoney(netProfit)}</span>
        </p>
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

function TeamTasksWidget() {
  const { t, i18n } = useTranslation()
  const { profile } = useAuth()
  const { data: tasks } = useQuery({
    queryKey: ['dashboard-team-tasks', profile?.id],
    enabled: !!profile,
    queryFn: async () => {
      // RLS (tasks_select_pm_scoped) already limits this to tasks in the PM's
      // own projects — no client-side project filtering needed.
      const { data, error } = await supabase
        .from('tasks')
        .select('id, title, deadline, percent_complete, assignee_profile_id')
        .neq('assignee_profile_id', profile!.id)
        .order('deadline', { ascending: true, nullsFirst: false })
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

  const assigneeName = (id: string | null) => profiles?.find((p) => p.id === id)?.full_name ?? '—'

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-medium">{t('dashboard.teamTasks')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {(tasks?.length ?? 0) === 0 && <p className="text-sm text-muted-foreground">{t('dashboard.teamTasksEmpty')}</p>}
        {tasks?.map((task) => (
          <div key={task.id} className="flex items-center gap-3 rounded-lg border border-border p-2.5">
            <div className="flex-1">
              <p className="text-sm font-medium">{task.title}</p>
              <p className="text-xs text-muted-foreground">
                {assigneeName(task.assignee_profile_id)} · {formatLocalDate(task.deadline, i18n.language)}
              </p>
            </div>
            <div className="w-24">
              <Progress value={task.percent_complete} />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

export function CabinetPage() {
  const { t, i18n } = useTranslation()
  const { profile, role, hasCapability } = useAuth()
  const isCeo = role?.slug === 'ceo'
  const isPm = role?.slug === 'pm'
  const canSeeTeamWidgets = isCeo || isPm
  const canSeeFinance = hasCapability('finance.read') || hasCapability('finance.write')

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

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('cabinet.title')}</h1>
        <p className="text-sm text-muted-foreground">{profile?.full_name}</p>
      </div>

      {canSeeTeamWidgets && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <DeadlinesWidget />
          <IdleTeamWidget />
          {isCeo && canSeeFinance && <FinanceWidget />}
          <TodayContentWidget />
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <PeriodicChecklist cadenceSlug="daily" title={t('checklist.daily')} />
        <PeriodicChecklist cadenceSlug="weekly" title={t('checklist.weekly')} />
        <PeriodicChecklist cadenceSlug="monthly" title={t('checklist.monthly')} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">{t('cabinet.myTasks')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {isLoading && <p className="text-sm text-muted-foreground">{t('common.loading')}...</p>}
          {!isLoading && (tasks?.length ?? 0) === 0 && (
            <p className="text-sm text-muted-foreground">{t('cabinet.empty')}</p>
          )}
          {tasks?.map((task) => (
            <div
              key={task.id}
              className="flex items-center gap-4 rounded-lg border border-border p-3"
            >
              <div className="flex-1">
                <p className="text-sm font-medium">{task.title}</p>
                <div className="mt-1 flex items-center gap-2">
                  {task.is_urgent && (
                    <Badge variant="destructive" className="text-[10px]">
                      {t('tasks.urgent')}
                    </Badge>
                  )}
                  {task.deadline && (
                    <span className="text-xs text-muted-foreground">
                      {formatLocalDate(task.deadline, i18n.language)}
                    </span>
                  )}
                </div>
              </div>
              <div className="w-28">
                <Progress value={task.percent_complete} />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {isPm && <TeamTasksWidget />}
    </div>
  )
}
