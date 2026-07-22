import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/auth/AuthProvider'
import { supabase } from '@/lib/supabaseClient'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CreateProjectDialog, ProjectDialog } from './CreateProjectDialog'
import { AiClientReportDialog } from './AiClientReportDialog'
import { ProjectMonthlyGoals } from './ProjectMonthlyGoals'
import { pickLabel } from '@/lib/localizedLabel'

export function ProjectsPage() {
  const { t, i18n } = useTranslation()
  const { isCeo } = useAuth()
  const [openProjectId, setOpenProjectId] = useState<string | null>(null)

  const { data: projects, isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select(
          'id, name, logo_url, goal, deliverables_text, target_audience, target_audience_voice_url, target_audience_file_url, billing_day, project_type_id, status_id, pm_profile_id, client_id'
        )
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

  const { data: clients } = useQuery({
    queryKey: ['clients-lookup'],
    queryFn: async () => {
      const { data, error } = await supabase.from('clients').select('id, name')
      if (error) throw error
      return data
    },
  })

  const projectIds = useMemo(() => (projects ?? []).map((p) => p.id), [projects])

  const { data: assistantsByProject } = useQuery({
    queryKey: ['project_members-assistants-batch', projectIds],
    enabled: projectIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_members')
        .select('project_id, profile_id')
        .in('project_id', projectIds)
        .eq('role_on_project', 'assistant_pm')
      if (error) throw error
      const map = new Map<string, string[]>()
      for (const row of data) {
        const list = map.get(row.project_id) ?? []
        list.push(row.profile_id)
        map.set(row.project_id, list)
      }
      return map
    },
  })

  const clientIds = useMemo(
    () => [...new Set((projects ?? []).map((p) => p.client_id).filter((id): id is string => !!id))],
    [projects]
  )

  const { data: contractClientIds } = useQuery({
    queryKey: ['contracts-client-ids', clientIds],
    enabled: isCeo && clientIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from('contracts').select('party_client_id').in('party_client_id', clientIds)
      if (error) throw error
      return new Set(data.map((r) => r.party_client_id))
    },
  })

  const pmName = (id: string) => managers?.find((m) => m.id === id)?.full_name
  const clientName = (id: string | null) => (id ? clients?.find((c) => c.id === id)?.name : undefined)
  const assistantNames = (id: string) =>
    (assistantsByProject?.get(id) ?? []).map((pid) => managers?.find((m) => m.id === pid)?.full_name).filter(Boolean)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{t('projects.title')}</h1>
        <CreateProjectDialog />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {isLoading && <p className="text-sm text-muted-foreground">{t('common.loading')}...</p>}
        {projects?.map((project) => (
          <Card
            key={project.id}
            className="cursor-pointer transition-colors hover:bg-muted/40"
            onClick={() => setOpenProjectId(project.id)}
          >
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-2 text-base font-medium">
                <span className="flex items-center gap-2">
                  {project.logo_url && (
                    <img src={project.logo_url} alt="" className="size-6 shrink-0 rounded-full object-cover" />
                  )}
                  {project.name}
                </span>
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
                {clientName(project.client_id) && (
                  <Badge variant="outline" className="text-[10px]">
                    {clientName(project.client_id)}
                  </Badge>
                )}
                {isCeo && contractClientIds?.has(project.client_id) && (
                  <Badge variant="secondary" className="text-[10px]">
                    {t('projects.contract')}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
              {project.goal && <p>{project.goal}</p>}
              {project.deliverables_text && (
                <p className="line-clamp-2 text-xs">{project.deliverables_text}</p>
              )}
              <div className="flex flex-wrap items-center gap-1.5">
                {project.billing_day && (
                  <Badge variant="secondary" className="w-fit">
                    {t('projects.billingDay')}: {project.billing_day}
                  </Badge>
                )}
                {(project.target_audience || project.target_audience_voice_url || project.target_audience_file_url) && (
                  <Badge variant="outline" className="w-fit text-[10px]">
                    {t('projects.audience')}
                  </Badge>
                )}
                {assistantNames(project.id).map((name) => (
                  <Badge key={name} variant="outline" className="w-fit text-[10px]">
                    {name}
                  </Badge>
                ))}
              </div>
              <div className="flex flex-col gap-2" onClick={(e) => e.stopPropagation()}>
                <ProjectMonthlyGoals projectId={project.id} />
                <div>
                  <AiClientReportDialog projectId={project.id} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {!isLoading && (projects?.length ?? 0) === 0 && (
          <p className="text-sm text-muted-foreground">—</p>
        )}
      </div>

      <ProjectDialog
        open={!!openProjectId}
        onOpenChange={(open) => !open && setOpenProjectId(null)}
        projectId={openProjectId}
      />
    </div>
  )
}
