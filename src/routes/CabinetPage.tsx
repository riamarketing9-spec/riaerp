import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/auth/AuthProvider'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { DailyChecklist } from './DailyChecklist'

export function CabinetPage() {
  const { t } = useTranslation()
  const { profile } = useAuth()

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

      <DailyChecklist />

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
                      Urgent
                    </Badge>
                  )}
                  {task.deadline && (
                    <span className="text-xs text-muted-foreground">
                      {new Date(task.deadline).toLocaleDateString('ru-RU')}
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
    </div>
  )
}
