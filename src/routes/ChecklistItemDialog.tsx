import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/auth/AuthProvider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { pickLabel } from '@/lib/localizedLabel'
import { cn } from '@/lib/utils'

// Deliberately not the general TaskSheet -- a chek-list item only ever
// needs a title and a recurrence (daily/weekly/monthly/one-time); no
// project/deadline/status/work-type/calendar. Recurrence can now ONLY be
// set here, not on a regular task (see TaskSheet, which dropped its own
// recurrence picker) -- so recurrence_id set is the definition of "this
// is a chek-list item" going forward.
export function ChecklistItemDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t, i18n } = useTranslation()
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const [title, setTitle] = useState('')
  const [recurrenceId, setRecurrenceId] = useState('')

  const { data: recurrenceTypes } = useQuery({
    queryKey: ['recurrence_types'],
    queryFn: async () => {
      const { data, error } = await supabase.from('recurrence_types').select('id, slug, label_ru, label_uz')
      if (error) throw error
      return data
    },
  })

  const { data: backlogStatus } = useQuery({
    queryKey: ['task_statuses-backlog'],
    queryFn: async () => {
      const { data, error } = await supabase.from('task_statuses').select('id').eq('slug', 'backlog').maybeSingle()
      if (error) throw error
      return data
    },
  })

  useEffect(() => {
    if (open) {
      setTitle('')
      setRecurrenceId('')
    }
  }, [open])

  const mutation = useMutation({
    mutationFn: async () => {
      if (!profile || !backlogStatus) throw new Error('Not ready')
      const { error } = await supabase.from('tasks').insert({
        title,
        assignee_profile_id: profile.id,
        status_id: backlogStatus.id,
        recurrence_id: recurrenceId,
        created_by: profile.id,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success(t('tasks.checklistItemAdded'))
      queryClient.invalidateQueries({ queryKey: ['recurring-checklist-tasks'] })
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['cabinet-tasks'] })
      queryClient.invalidateQueries({ queryKey: ['tasks-kanban'] })
      onOpenChange(false)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const canSave = !!title.trim() && !!recurrenceId

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('tasks.newChecklistItem')}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="checklist-title">{t('tasks.title')}</Label>
            <Input id="checklist-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{t('tasks.recurrence')}</Label>
            <div className="flex gap-2">
              {recurrenceTypes?.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setRecurrenceId(r.id)}
                  className={cn(
                    'flex-1 rounded-lg border px-2 py-2 text-xs font-medium transition-colors',
                    recurrenceId === r.id
                      ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200'
                      : 'border-border text-muted-foreground hover:bg-muted'
                  )}
                >
                  {pickLabel(r, i18n.language)}
                </button>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button disabled={!canSave || mutation.isPending} onClick={() => mutation.mutate()}>
            {t('common.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
