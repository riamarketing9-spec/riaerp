import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/auth/AuthProvider'

// Mirrors the tasks_delete RLS policy client-side so the trash-icon button
// doesn't show up on tasks a delete would silently (or noisily) fail on.
export function useCanDeleteTask() {
  const { profile, hasCapability } = useAuth()
  const isCeo = hasCapability('org.full_access')
  const canManageProjects = hasCapability('projects.manage')
  const canAssignOthers = hasCapability('tasks.assign_others')

  const { data: pmProjectIds } = useQuery({
    queryKey: ['pm-project-ids', profile?.id],
    enabled: !!profile && !isCeo && !canManageProjects,
    queryFn: async () => {
      const { data, error } = await supabase.from('projects').select('id').eq('pm_profile_id', profile!.id)
      if (error) throw error
      return new Set(data.map((p) => p.id))
    },
  })

  return function canDeleteTask(task: { created_by: string | null; assignee_profile_id: string | null; project_id: string | null }) {
    if (isCeo || canManageProjects) return true
    if (task.project_id && pmProjectIds?.has(task.project_id)) return true
    if (!!profile && task.created_by === profile.id && task.assignee_profile_id === profile.id) return true
    // tasks_delete_scoped_assign (0078): a creator with tasks.assign_others
    // can delete a task they made for someone else -- undoing a mistaken
    // assignment, not just self-assigned tasks.
    return !!profile && canAssignOthers && task.created_by === profile.id
  }
}
