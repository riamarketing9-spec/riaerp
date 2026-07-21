import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabaseClient'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'

export function WorkloadPage() {
  const { t } = useTranslation()
  const [startsAfter, setStartsAfter] = useState('')

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
          const ratio = row.max_open_tasks > 0 ? row.open_task_count / row.max_open_tasks : 0
          const overloaded = row.open_task_count > row.max_open_tasks
          const employeeKpi = kpiFor(row.profile_id)
          return (
            <Card
              key={row.profile_id}
              className={cn(
                'border-2',
                overloaded
                  ? 'border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/40'
                  : ratio > 0
                    ? 'border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40'
                    : 'border-emerald-300 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40'
              )}
            >
              <CardContent className="flex flex-col gap-2 py-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">{row.full_name}</p>
                  <Badge
                    className={cn(
                      overloaded
                        ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
                        : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                    )}
                  >
                    {overloaded ? t('workload.overloaded') : 'OK'}
                  </Badge>
                </div>
                <Progress value={Math.min(ratio * 100, 100)} />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {row.open_task_count} / {row.max_open_tasks} {t('workload.openTasks').toLowerCase()}
                  </span>
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
    </div>
  )
}
