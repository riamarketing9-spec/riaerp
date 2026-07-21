import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabaseClient'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CreateProjectDialog } from './CreateProjectDialog'
import { AiClientReportDialog } from './AiClientReportDialog'
import { ProjectMonthlyGoals } from './ProjectMonthlyGoals'
import { pickLabel } from '@/lib/localizedLabel'

export function ProjectsPage() {
  const { t, i18n } = useTranslation()

  const { data: projects, isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('id, name, goal, target_audience, billing_day, project_type_id, status_id, pm_profile_id')
      if (error) throw error
      return data
    },
  })

  const { data: projectTypes } = useQuery({
    queryKey: ['project_types'],
    queryFn: async () => {
      const { data, error } = await supabase.from('project_types').select('id, label_ru, label_uz')
      if (error) throw error
      return data
    },
  })

  const { data: projectStatuses } = useQuery({
    queryKey: ['project_statuses'],
    queryFn: async () => {
      const { data, error } = await supabase.from('project_statuses').select('id, label_ru, label_uz')
      if (error) throw error
      return data
    },
  })

  const { data: managers } = useQuery({
    queryKey: ['managers'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('id, full_name')
      if (error) throw error
      return data
    },
  })

  const pmName = (id: string) => managers?.find((m) => m.id === id)?.full_name

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{t('projects.title')}</h1>
        <CreateProjectDialog />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {isLoading && <p className="text-sm text-muted-foreground">{t('common.loading')}...</p>}
        {projects?.map((project) => (
          <Card key={project.id}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-2 text-base font-medium">
                <span>{project.name}</span>
                {pmName(project.pm_profile_id) && (
                  <span className="text-xs font-normal text-muted-foreground">{pmName(project.pm_profile_id)}</span>
                )}
              </CardTitle>
              <div className="flex flex-wrap gap-1.5 pt-1">
                <Badge variant="secondary" className="text-[10px]">
                  {pickLabel(projectTypes?.find((pt) => pt.id === project.project_type_id), i18n.language)}
                </Badge>
                <Badge variant="outline" className="text-[10px]">
                  {pickLabel(projectStatuses?.find((ps) => ps.id === project.status_id), i18n.language)}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
              {project.goal && <p>{project.goal}</p>}
              {project.billing_day && (
                <Badge variant="secondary" className="w-fit">
                  {t('projects.billingDay')}: {project.billing_day}
                </Badge>
              )}
              <ProjectMonthlyGoals projectId={project.id} />
              <div>
                <AiClientReportDialog projectId={project.id} />
              </div>
            </CardContent>
          </Card>
        ))}
        {!isLoading && (projects?.length ?? 0) === 0 && (
          <p className="text-sm text-muted-foreground">—</p>
        )}
      </div>
    </div>
  )
}
