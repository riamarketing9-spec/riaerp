import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabaseClient'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export function WorkloadPage() {
  const { t } = useTranslation()

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

  const kpiFor = (profileId: string) => kpi?.find((k) => k.profile_id === profileId)

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t('workload.title')}</h1>

      <div className="flex flex-col gap-2">
        {isLoading && <p className="text-sm text-muted-foreground">{t('common.loading')}...</p>}
        {workload?.map((row) => {
          const overloaded = row.open_task_count > row.max_open_tasks
          const employeeKpi = kpiFor(row.profile_id)
          return (
            <Card key={row.profile_id}>
              <CardContent className="flex items-center justify-between py-3">
                <p className="text-sm font-medium">{row.full_name}</p>
                <div className="flex items-center gap-4">
                  {employeeKpi && (
                    <span className="text-xs text-muted-foreground">
                      {t('kpi.tasksCompleted')}: {employeeKpi.tasks_completed} ·{' '}
                      {t('kpi.avgPercent')}:{' '}
                      {employeeKpi.avg_percent_complete
                        ? Math.round(employeeKpi.avg_percent_complete)
                        : 0}
                      %
                    </span>
                  )}
                  <span className="text-sm text-muted-foreground">
                    {row.open_task_count} / {row.max_open_tasks} {t('workload.openTasks').toLowerCase()}
                  </span>
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
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
