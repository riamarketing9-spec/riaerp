import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabaseClient'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Combobox } from '@/components/ui/combobox'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { pickLabel, formatLocalDateTime } from '@/lib/localizedLabel'
import { formatDurationMs } from '@/lib/duration'
import { computeMonthlyProgress } from '@/lib/projectMonthlyProgress'
import { MonthlyProgressBreakdown } from '@/components/MonthlyProgressBreakdown'

// Plain local-calendar date strings, built directly from Y/M/D -- NOT via
// `new Date(y, m, 1).toISOString()`, which converts local midnight to UTC
// and silently shifts the date back a day for any timezone ahead of UTC
// (e.g. Asia/Tashkent, UTC+5), making "this month" resolve to last month.
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

// "Xodim bo'yicha": per-employee task KPIs over a date range, as counts
// rather than percentages -- a bare "% on time" reads as "he was late" even
// when the real reason is simply that no deadline was ever set (nothing to
// judge on-time-ness by), so the denominator is only tasks that actually
// had a deadline. "On time" itself is an exact timestamp comparison
// (completed_at <= deadline) -- same-day-but-after-the-deadline-hour still
// counts as late, not just a different calendar day.
function EmployeeKpiTab() {
  const { t, i18n } = useTranslation()
  const [profileId, setProfileId] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const { data: profiles } = useQuery({
    queryKey: ['profiles-lookup-active'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('id, full_name').is('deleted_at', null)
      if (error) throw error
      return data
    },
  })

  const { data: tasks } = useQuery({
    queryKey: ['kpi-employee-tasks', profileId],
    enabled: !!profileId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select('id, title, status_id, completed_at, deadline, percent_complete')
        .eq('assignee_profile_id', profileId)
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
  const doneId = statuses?.find((s) => s.slug === 'done')?.id

  const inRange = (dateStr: string | null) => {
    if (!dateStr) return false
    if (dateFrom && dateStr < dateFrom) return false
    if (dateTo && dateStr > `${dateTo}T23:59:59`) return false
    return true
  }

  const completedInRange = (tasks ?? []).filter((tsk) => tsk.status_id === doneId && inRange(tsk.completed_at))
  const withDeadline = completedInRange
    .filter((tsk) => tsk.deadline)
    .slice()
    .sort(
      (a, b) =>
        new Date(b.completed_at!).getTime() - new Date(b.deadline!).getTime() -
        (new Date(a.completed_at!).getTime() - new Date(a.deadline!).getTime())
    )
  const onTimeCount = withDeadline.filter((tsk) => tsk.completed_at! <= tsk.deadline!).length
  const fullyDoneCount = (tasks ?? []).filter((tsk) => tsk.percent_complete >= 100).length

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border p-3">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">{t('team.title')}</Label>
          <Combobox
            className="w-52"
            options={(profiles ?? []).map((p) => ({ value: p.id, label: p.full_name }))}
            value={profileId}
            onChange={setProfileId}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">{t('contentPlan.dateFrom')}</Label>
          <Input type="date" className="w-40" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">{t('contentPlan.dateTo')}</Label>
          <Input type="date" className="w-40" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
      </div>

      {!profileId && <p className="text-sm text-muted-foreground">{t('kpi.pickEmployee')}</p>}

      {profileId && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card>
            <CardContent className="flex flex-col gap-1 py-4">
              <span className="text-xs text-muted-foreground">{t('kpi.tasksCompleted')}</span>
              <span className="text-2xl font-bold">{completedInRange.length}</span>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex flex-col gap-1 py-4">
              <span className="text-xs text-muted-foreground">{t('kpi.onTimeCount')}</span>
              <span className="text-2xl font-bold">
                {onTimeCount} / {withDeadline.length}
              </span>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex flex-col gap-1 py-4">
              <span className="text-xs text-muted-foreground">{t('kpi.fullyDoneCount')}</span>
              <span className="text-2xl font-bold">
                {fullyDoneCount} / {(tasks ?? []).length}
              </span>
            </CardContent>
          </Card>
        </div>
      )}

      {profileId && withDeadline.length > 0 && (
        <Card>
          <CardContent className="flex flex-col gap-1.5 py-4">
            <span className="mb-1 text-sm font-medium">{t('kpi.lateList')}</span>
            {withDeadline.map((tsk) => {
              const onTime = tsk.completed_at! <= tsk.deadline!
              const lateMs = new Date(tsk.completed_at!).getTime() - new Date(tsk.deadline!).getTime()
              return (
                <div key={tsk.id} className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2 py-1.5 text-xs">
                  <span className="flex-1 truncate">{tsk.title}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {t('tasks.deadline')}: {formatLocalDateTime(tsk.deadline, i18n.language)}
                  </span>
                  {onTime ? (
                    <Badge variant="secondary" className="shrink-0 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                      {t('kpi.onTimeBadge')}
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="shrink-0">
                      +{formatDurationMs(lateMs)}
                    </Badge>
                  )}
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// "Loyiha bo'yicha": exactly the same monthly-goal-vs-actual logic as the
// project card's progress bar (computeMonthlyProgress) -- no separate
// date-range-based "% published" metric, so this tab and the Projects page
// can never disagree about what this month's number is.
function ProjectKpiTab() {
  const { t, i18n } = useTranslation()
  const [projectId, setProjectId] = useState('')

  const { data: projects } = useQuery({
    queryKey: ['projects-lookup-quota'],
    queryFn: async () => {
      const { data, error } = await supabase.from('projects').select('id, name').order('name')
      if (error) throw error
      return data
    },
  })

  const monthKeyRef = useMemo(() => monthRange(new Date()), [])

  const { data: monthlyGoal } = useQuery({
    queryKey: ['kpi-project-monthly-goal', projectId, monthKeyRef.start],
    enabled: !!projectId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_monthly_goals')
        .select('target_posts, target_stories, target_ads')
        .eq('project_id', projectId)
        .eq('month', monthKeyRef.start)
        .maybeSingle()
      if (error) throw error
      return data
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

  const { data: doneStatus } = useQuery({
    queryKey: ['task_statuses-done'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('task_statuses')
        .select('id, label_ru, label_uz')
        .eq('slug', 'done')
        .maybeSingle()
      if (error) throw error
      return data
    },
  })

  const { data: monthItems } = useQuery({
    queryKey: ['kpi-project-month-items', projectId, publishedStatus?.id, monthKeyRef.start],
    enabled: !!projectId && !!publishedStatus,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('content_plan_items')
        .select('id, topic, format_id, publish_date')
        .eq('project_id', projectId)
        .eq('status_id', publishedStatus!.id)
        .gte('publish_date', monthKeyRef.start)
        .lt('publish_date', monthKeyRef.end)
      if (error) throw error
      return data
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

  const { data: monthDoneTasks } = useQuery({
    queryKey: ['kpi-project-month-tasks', projectId, doneStatus?.id, monthKeyRef.start],
    enabled: !!projectId && !!doneStatus,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select('id, title, completed_at')
        .eq('project_id', projectId)
        .eq('status_id', doneStatus!.id)
        .gte('completed_at', monthKeyRef.start)
        .lt('completed_at', monthKeyRef.end)
      if (error) throw error
      return data
    },
  })

  const taskIds = useMemo(() => (monthDoneTasks ?? []).map((t) => t.id), [monthDoneTasks])
  const { data: taskDeliverables } = useQuery({
    queryKey: ['task_deliverable_types-for-kpi', taskIds],
    enabled: taskIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('task_deliverable_types')
        .select('task_id, deliverable_type_id')
        .in('task_id', taskIds)
      if (error) throw error
      return data
    },
  })

  const formatSlugOf = (formatId: string) => contentFormats?.find((f) => f.id === formatId)?.slug
  const deliverableLabelOf = (deliverableTypeId: string) =>
    deliverableTypes?.find((d) => d.id === deliverableTypeId)?.label_uz.trim().toLowerCase() ?? ''

  const detail = computeMonthlyProgress({
    goal: monthlyGoal ?? undefined,
    items: monthItems ?? [],
    doneTasks: monthDoneTasks ?? [],
    taskDeliverables: taskDeliverables ?? [],
    formatSlugOf,
    deliverableLabelOf,
  })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border p-3">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">{t('projects.title')}</Label>
          <Combobox
            className="w-52"
            options={(projects ?? []).map((p) => ({ value: p.id, label: p.name }))}
            value={projectId}
            onChange={setProjectId}
          />
        </div>
      </div>

      {!projectId && <p className="text-sm text-muted-foreground">{t('kpi.pickProject')}</p>}

      {projectId && (
        <>
          {!monthlyGoal && <p className="text-sm text-muted-foreground">{t('kpi.noMonthlyGoal')}</p>}

          {detail && (
            <Card>
              <CardContent className="flex flex-col gap-1 py-4">
                <span className="text-xs text-muted-foreground">{t('kpi.projectPercentDone')}</span>
                <span className="text-2xl font-bold">{detail.percent}%</span>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="py-4">
              <span className="mb-3 block text-sm font-medium">{t('kpi.clientReport')}</span>
              <MonthlyProgressBreakdown
                detail={detail}
                publishedStatusLabel={pickLabel(publishedStatus, i18n.language) ?? ''}
                doneStatusLabel={pickLabel(doneStatus, i18n.language) ?? ''}
              />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

export function KpiReportsPage() {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-4xl font-bold tracking-tight">{t('kpi.reportsTitle')}</h1>

      <Tabs defaultValue="employee">
        <TabsList>
          <TabsTrigger value="employee">{t('kpi.byEmployee')}</TabsTrigger>
          <TabsTrigger value="project">{t('kpi.byProject')}</TabsTrigger>
        </TabsList>
        <TabsContent value="employee">
          <EmployeeKpiTab />
        </TabsContent>
        <TabsContent value="project">
          <ProjectKpiTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
