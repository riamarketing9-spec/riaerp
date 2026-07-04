import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabaseClient'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CreateProjectDialog } from './CreateProjectDialog'

export function ProjectsPage() {
  const { t } = useTranslation()

  const { data: projects, isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('id, name, goal, target_audience, billing_day')
      if (error) throw error
      return data
    },
  })

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
              <CardTitle className="text-base font-medium">{project.name}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
              {project.goal && <p>{project.goal}</p>}
              {project.billing_day && (
                <Badge variant="secondary" className="w-fit">
                  {t('projects.billingDay')}: {project.billing_day}
                </Badge>
              )}
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
