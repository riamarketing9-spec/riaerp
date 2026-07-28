import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabaseClient'
import { Card } from '@/components/ui/card'
import { Avatar } from '@/components/Avatar'
import { CreateProjectDialog, ProjectDialog } from './CreateProjectDialog'
import { pickLabel } from '@/lib/localizedLabel'

// Deterministic color per project so the no-logo placeholder is still
// visually distinguishable from card to card, same idea as the content-plan
// calendar's project dots.
const PLACEHOLDER_COLORS = [
  'bg-rose-500', 'bg-orange-500', 'bg-amber-500', 'bg-lime-500',
  'bg-emerald-500', 'bg-teal-500', 'bg-cyan-500', 'bg-blue-500',
  'bg-violet-500', 'bg-fuchsia-500',
]
function placeholderColorFor(id: string) {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  return PLACEHOLDER_COLORS[hash % PLACEHOLDER_COLORS.length]
}

export function ProjectsPage() {
  const { t, i18n } = useTranslation()
  const [openProjectId, setOpenProjectId] = useState<string | null>(null)

  const { data: projects, isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('id, name, logo_url, project_type_id, pm_profile_id')
        .order('name')
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

  const { data: managers } = useQuery({
    queryKey: ['managers-with-avatar'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('id, full_name, avatar_url')
      if (error) throw error
      return data
    },
  })

  const { data: kpiByProject } = useQuery({
    queryKey: ['v_project_kpi'],
    queryFn: async () => {
      const { data, error } = await supabase.from('v_project_kpi').select('project_id, avg_task_percent_complete')
      if (error) throw error
      return new Map(data.map((row) => [row.project_id, row.avg_task_percent_complete ?? 0]))
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

  const manager = (id: string) => managers?.find((m) => m.id === id)

  // PM + assistant PMs, PM first, deduped -- the "responsible" avatars.
  const responsibleFor = (project: { id: string; pm_profile_id: string }) => {
    const ids = [project.pm_profile_id, ...(assistantsByProject?.get(project.id) ?? [])]
    return [...new Set(ids)].map((id) => manager(id)).filter((m): m is NonNullable<typeof m> => !!m)
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <h1 className="text-4xl font-bold tracking-tight">{t('projects.title')}</h1>
        <CreateProjectDialog />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading && <p className="text-sm text-muted-foreground">{t('common.loading')}...</p>}
        {projects?.map((project) => {
          const progress = Math.round(kpiByProject?.get(project.id) ?? 0)
          return (
            <Card
              key={project.id}
              className="cursor-pointer overflow-hidden p-0 transition-colors hover:bg-muted/40"
              onClick={() => setOpenProjectId(project.id)}
            >
              <div className="flex h-28 w-full items-center justify-center overflow-hidden bg-muted">
                {project.logo_url ? (
                  <img src={project.logo_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div
                    className={`flex h-full w-full items-center justify-center text-3xl font-bold text-white ${placeholderColorFor(project.id)}`}
                  >
                    {project.name[0]?.toUpperCase()}
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-2.5 p-4">
                <div>
                  <h3 className="truncate font-semibold">{project.name}</h3>
                  <p className="text-xs text-muted-foreground">
                    {pickLabel(projectTypes?.find((pt) => pt.id === project.project_type_id), i18n.language)}
                  </p>
                </div>

                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-brand-600 transition-[width]"
                    style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                  />
                </div>

                <div className="flex items-center justify-end -space-x-2">
                  {responsibleFor(project).map((m) => (
                    <Avatar
                      key={m.id}
                      name={m.full_name}
                      avatarUrl={m.avatar_url}
                      className="size-7 rounded-full text-[10px] ring-2 ring-background"
                    />
                  ))}
                </div>
              </div>
            </Card>
          )
        })}
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
