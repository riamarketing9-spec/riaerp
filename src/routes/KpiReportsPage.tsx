import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabaseClient'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Combobox } from '@/components/ui/combobox'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { pickLabel } from '@/lib/localizedLabel'

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

// "Xodim bo'yicha": per-employee task KPIs (completed count, on-time %,
// average completion %) over a date range -- the counterpart to
// v_employee_kpi, which has no date filter of its own.
function EmployeeKpiTab() {
  const { t } = useTranslation()
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
        .select('id, status_id, completed_at, deadline, percent_complete')
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
  const onTimeCount = completedInRange.filter((tsk) => tsk.deadline && tsk.completed_at! <= tsk.deadline).length
  const onTimePct = completedInRange.length > 0 ? Math.round((onTimeCount / completedInRange.length) * 100) : 0
  const avgPercent =
    (tasks ?? []).length > 0
      ? Math.round((tasks ?? []).reduce((sum, tsk) => sum + tsk.percent_complete, 0) / (tasks ?? []).length)
      : 0

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
              <span className="text-xs text-muted-foreground">{t('kpi.onTimePct')}</span>
              <span className="text-2xl font-bold">{onTimePct}%</span>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex flex-col gap-1 py-4">
              <span className="text-xs text-muted-foreground">{t('kpi.avgPercentComplete')}</span>
              <span className="text-2xl font-bold">{avgPercent}%</span>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

// "Loyiha bo'yicha" + "Mijoz hisoboti": per-project completion % (from the
// content plan, same source as the project card's progress bar), this
// month's output vs the monthly quota, and a plain-text breakdown of what
// shipped in the selected range -- everything from data that already
// exists, nothing manually entered.
function ProjectKpiTab() {
  const { t, i18n } = useTranslation()
  const [projectId, setProjectId] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const { data: projects } = useQuery({
    queryKey: ['projects-lookup-quota'],
    queryFn: async () => {
      const { data, error } = await supabase.from('projects').select('id, name').order('name')
      if (error) throw error
      return data
    },
  })

  const currentMonthKey = useMemo(() => monthRange(new Date()).start, [])
  const { data: monthlyGoal } = useQuery({
    queryKey: ['kpi-project-monthly-goal', projectId, currentMonthKey],
    enabled: !!projectId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_monthly_goals')
        .select('target_posts, target_stories, target_ads')
        .eq('project_id', projectId)
        .eq('month', currentMonthKey)
        .maybeSingle()
      if (error) throw error
      return data
    },
  })

  const { data: contentFormats } = useQuery({
    queryKey: ['content_formats'],
    queryFn: async () => {
      const { data, error } = await supabase.from('content_formats').select('id, slug, label_ru, label_uz')
      if (error) throw error
      return data
    },
  })

  const { data: contentStatuses } = useQuery({
    queryKey: ['content_statuses'],
    queryFn: async () => {
      const { data, error } = await supabase.from('content_statuses').select('id, slug')
      if (error) throw error
      return data
    },
  })
  const publishedId = contentStatuses?.find((s) => s.slug === 'published')?.id

  const { data: items } = useQuery({
    queryKey: ['kpi-project-items', projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('content_plan_items')
        .select('id, topic, format_id, status_id, publish_date')
        .eq('project_id', projectId)
        .not('publish_date', 'is', null)
      if (error) throw error
      return data
    },
  })

  const monthKeyRef = useMemo(() => monthRange(new Date()), [])
  const inRange = (dateStr: string | null) => {
    if (!dateStr) return false
    if (dateFrom && dateStr < dateFrom) return false
    if (dateTo && dateStr > dateTo) return false
    return true
  }

  const itemsInRange = (items ?? []).filter((i) => inRange(i.publish_date))
  const publishedInRange = itemsInRange.filter((i) => i.status_id === publishedId)
  const percentDone = itemsInRange.length > 0 ? Math.round((publishedInRange.length / itemsInRange.length) * 100) : 0

  const formatSlug = (id: string) => contentFormats?.find((f) => f.id === id)?.slug
  const monthPublished = (items ?? []).filter(
    (i) => i.status_id === publishedId && i.publish_date! >= monthKeyRef.start && i.publish_date! < monthKeyRef.end
  )
  const monthPosts = monthPublished.filter((i) => ['post', 'reels', 'carousel'].includes(formatSlug(i.format_id) ?? '')).length
  const monthStories = monthPublished.filter((i) => formatSlug(i.format_id) === 'stories').length

  const byFormat = useMemo(() => {
    const map = new Map<string, number>()
    for (const i of publishedInRange) {
      const slug = formatSlug(i.format_id) ?? '—'
      map.set(slug, (map.get(slug) ?? 0) + 1)
    }
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publishedInRange, contentFormats])

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
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">{t('contentPlan.dateFrom')}</Label>
          <Input type="date" className="w-40" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">{t('contentPlan.dateTo')}</Label>
          <Input type="date" className="w-40" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
      </div>

      {!projectId && <p className="text-sm text-muted-foreground">{t('kpi.pickProject')}</p>}

      {projectId && (
        <>
          {!monthlyGoal && <p className="text-sm text-muted-foreground">{t('kpi.noMonthlyGoal')}</p>}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card>
              <CardContent className="flex flex-col gap-1 py-4">
                <span className="text-xs text-muted-foreground">{t('kpi.projectPercentDone')}</span>
                <span className="text-2xl font-bold">{percentDone}%</span>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex flex-col gap-1 py-4">
                <span className="text-xs text-muted-foreground">
                  {t('kpi.monthPosts')} ({monthlyGoal?.target_posts ?? 0} {t('kpi.planned')})
                </span>
                <span className="text-2xl font-bold">{monthPosts}</span>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex flex-col gap-1 py-4">
                <span className="text-xs text-muted-foreground">
                  {t('kpi.monthStories')} ({monthlyGoal?.target_stories ?? 0} {t('kpi.planned')})
                </span>
                <span className="text-2xl font-bold">{monthStories}</span>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex flex-col gap-1 py-4">
                <span className="text-xs text-muted-foreground">{t('kpi.monthTarget')}</span>
                <span className="text-2xl font-bold">
                  {monthlyGoal?.target_ads ? t('common.yes') : t('common.no')}
                </span>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="flex flex-col gap-1.5 py-4">
              <span className="text-sm font-medium">{t('kpi.clientReport')}</span>
              {byFormat.size === 0 && <p className="text-sm text-muted-foreground">{t('kpi.expenseBreakdownEmpty')}</p>}
              {[...byFormat.entries()].map(([slug, count]) => (
                <div key={slug} className="flex items-center justify-between text-sm">
                  <span>{pickLabel(contentFormats?.find((f) => f.slug === slug), i18n.language) ?? slug}</span>
                  <span className="font-medium">{count}</span>
                </div>
              ))}
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
