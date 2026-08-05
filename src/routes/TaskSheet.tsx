import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/auth/AuthProvider'
import { useAutosave } from '@/hooks/useAutosave'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Combobox } from '@/components/ui/combobox'
import { Plus, X } from 'lucide-react'
import { pickLabel, formatLocalDateTime } from '@/lib/localizedLabel'
import { formatDurationMs } from '@/lib/duration'
import { cn } from '@/lib/utils'

const schema = z.object({
  title: z.string().min(1, 'Обязательное поле'),
  project_id: z.string().optional(),
  assignee_profile_id: z.string().optional(),
  status_id: z.string().min(1, 'Обязательное поле'),
  deadline: z.string().optional(),
  starts_at: z.string().optional(),
  deliverable_text: z.string().optional(),
  term_type_id: z.string().optional(),
  quadrant_id: z.string().optional(),
  recurrence_id: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

function suggestTermSlug(dateStr: string): 'qisqa' | 'orta' | 'uzoq' | null {
  if (!dateStr) return null
  const days = (new Date(dateStr).getTime() - Date.now()) / (24 * 60 * 60 * 1000)
  if (days <= 3) return 'qisqa'
  if (days <= 10) return 'orta'
  return 'uzoq'
}

// datetime-local inputs need "YYYY-MM-DDTHH:mm" in the viewer's local time —
// stored values are UTC ISO strings, so the offset has to be applied both
// ways (display here, parsed back to UTC by `new Date(...)` on submit).
function toDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

const HOURS_24 = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const MINUTES_60 = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'))

// The native <input type="datetime-local"> time picker's AM/PM-vs-24h
// display follows the browser/OS locale, not anything the app controls --
// this is why it keeps "coming back" no matter what's tried at the HTML
// level. Sidestepping it entirely: a native date input (no AM/PM there)
// plus two plain 00-23/00-59 dropdowns, so the hour is always
// unambiguous regardless of locale. Emits the same "YYYY-MM-DDTHH:mm"
// shape the rest of the form already expects.
function DateTime24Field({
  id,
  value,
  onChange,
  disabled,
}: {
  id: string
  value: string
  onChange: (v: string) => void
  disabled?: boolean
}) {
  const [datePart, timePart] = value ? value.split('T') : ['', '']
  const [hh, mm] = timePart ? timePart.split(':') : ['', '']

  function setParts(nextDate: string, nextHH: string, nextMM: string) {
    onChange(nextDate ? `${nextDate}T${nextHH || '00'}:${nextMM || '00'}` : '')
  }

  return (
    <div className="flex items-center gap-1.5">
      <Input
        id={id}
        type="date"
        className="flex-1"
        disabled={disabled}
        value={datePart}
        onChange={(e) => setParts(e.target.value, hh, mm)}
      />
      <Select value={hh || undefined} onValueChange={(v) => setParts(datePart, v ?? '00', mm)} disabled={disabled || !datePart}>
        <SelectTrigger className="w-16">
          <SelectValue placeholder="00">{() => hh || '00'}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {HOURS_24.map((h) => (
            <SelectItem key={h} value={h}>
              {h}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="text-muted-foreground">:</span>
      <Select value={mm || undefined} onValueChange={(v) => setParts(datePart, hh, v ?? '00')} disabled={disabled || !datePart}>
        <SelectTrigger className="w-16">
          <SelectValue placeholder="00">{() => mm || '00'}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {MINUTES_60.map((m) => (
            <SelectItem key={m} value={m}>
              {m}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

export function TaskSheet({
  open,
  onOpenChange,
  taskId,
  defaultProjectId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  taskId: string | null
  defaultProjectId?: string
}) {
  const { t, i18n } = useTranslation()
  const { profile, hasCapability } = useAuth()
  const queryClient = useQueryClient()
  const isEdit = !!taskId
  const [newSubtask, setNewSubtask] = useState('')
  const [newComment, setNewComment] = useState('')
  const [selectedDeliverableTypes, setSelectedDeliverableTypes] = useState<Set<string>>(new Set())
  // Local id for a task created by autosave before the parent ever passed a
  // taskId down -- mirrors the same pattern used in ContentItemSheet.
  const [draftId, setDraftId] = useState<string | null>(null)
  const effectiveId = taskId ?? draftId

  const { data: statuses } = useQuery({
    queryKey: ['task_statuses'],
    queryFn: async () => {
      const { data, error } = await supabase.from('task_statuses').select('id, slug, label_ru, label_uz').order('sort_order')
      if (error) throw error
      return data
    },
  })

  const { data: termTypes } = useQuery({
    queryKey: ['task_term_types'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('task_term_types')
        .select('id, slug, label_ru, label_uz, day_min, day_max')
        .order('sort_order')
      if (error) throw error
      return data
    },
  })

  const { data: quadrants } = useQuery({
    queryKey: ['task_priority_quadrants'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('task_priority_quadrants')
        .select('id, slug, label_ru, label_uz')
        .order('sort_order')
      if (error) throw error
      return data
    },
  })

  const { data: projects } = useQuery({
    queryKey: ['projects-lookup'],
    queryFn: async () => {
      const { data, error } = await supabase.from('projects').select('id, name, pm_profile_id')
      if (error) throw error
      return data
    },
  })

  const { data: assignees } = useQuery({
    queryKey: ['assignees'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('id, full_name').is('deleted_at', null)
      if (error) throw error
      return data
    },
  })

  const { data: deliverableTypes } = useQuery({
    queryKey: ['deliverable_types'],
    queryFn: async () => {
      const { data, error } = await supabase.from('deliverable_types').select('id, label_ru, label_uz')
      if (error) throw error
      return data
    },
  })

  const { data: existing } = useQuery({
    queryKey: ['task-detail', taskId],
    enabled: !!taskId && open,
    queryFn: async () => {
      const { data, error } = await supabase.from('tasks').select('*').eq('id', taskId!).single()
      if (error) throw error
      return data
    },
  })

  const { data: subtasks } = useQuery({
    queryKey: ['task_items', taskId],
    enabled: !!taskId && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('task_items')
        .select('id, title, is_done, sort_order, created_at, completed_at')
        .eq('task_id', taskId!)
        .order('sort_order')
      if (error) throw error
      return data
    },
  })

  const { data: comments } = useQuery({
    queryKey: ['task_comments', taskId],
    enabled: !!taskId && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('task_comments')
        .select('id, body, author_profile_id, created_at')
        .eq('task_id', taskId!)
        .order('created_at')
      if (error) throw error
      return data
    },
  })

  const { data: assistantPmRow } = useQuery({
    queryKey: ['task-sheet-assistant-pm-check', existing?.project_id, profile?.id],
    enabled: !!existing?.project_id && !!profile,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_members')
        .select('role_on_project')
        .eq('project_id', existing!.project_id!)
        .eq('profile_id', profile!.id)
        .maybeSingle()
      if (error) throw error
      return data
    },
  })

  // A plain assignee (not CEO/PM/assistant-PM/projects.manage) may only
  // change this task's status -- everything else is locked in the UI, and
  // enforced for real by a DB trigger regardless of what the UI allows.
  // Exception: a task someone made for themselves (self-created and still
  // self-assigned) is theirs to fully manage -- that's everyone's baseline
  // "keep my own to-do list" right, independent of role/capabilities.
  const currentProject = projects?.find((p) => p.id === existing?.project_id)
  const isPmOfProject = !!profile && currentProject?.pm_profile_id === profile.id
  const isAssistantPmOfProject = assistantPmRow?.role_on_project === 'assistant_pm'
  const canManageTask =
    hasCapability('org.full_access') || hasCapability('projects.manage') || isPmOfProject || isAssistantPmOfProject
  const isSelfCreatedOwnTask =
    !!profile && existing?.created_by === profile.id && existing?.assignee_profile_id === profile.id
  const isOwnTaskOnly =
    isEdit && !canManageTask && !isSelfCreatedOwnTask && existing?.assignee_profile_id === profile?.id
  // Someone without task-management rights can only ever hand a task to
  // themselves -- assigning it to a colleague is still a PM/CEO action.
  // Applies both to a brand-new task and to editing one they made for
  // themselves earlier; a task assigned to them BY someone else is already
  // locked entirely via isOwnTaskOnly above, so it's excluded here.
  const assigneeLockedToSelf = !canManageTask && (!isEdit || isSelfCreatedOwnTask)

  // PM/CEO only, per RLS on task_status_log -- a plain assignee's request
  // just comes back empty, this only avoids the wasted fetch.
  const { data: statusLog } = useQuery({
    queryKey: ['task_status_log', taskId],
    enabled: !!taskId && open && canManageTask,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('task_status_log')
        .select('status_id, changed_at')
        .eq('task_id', taskId!)
        .order('changed_at')
      if (error) throw error
      return data
    },
  })

  const { data: existingDeliverableTypes } = useQuery({
    queryKey: ['task_deliverable_types', taskId],
    enabled: !!taskId && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('task_deliverable_types')
        .select('deliverable_type_id')
        .eq('task_id', taskId!)
      if (error) throw error
      return data.map((r) => r.deliverable_type_id)
    },
  })

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
  })

  useEffect(() => {
    if (open && !isEdit) {
      reset({
        project_id: defaultProjectId ?? '',
        assignee_profile_id: !canManageTask ? (profile?.id ?? '') : '',
      })
      setSelectedDeliverableTypes(new Set())
      setDraftId(null)
    }
  }, [open, isEdit, defaultProjectId, reset, canManageTask, profile?.id])

  useEffect(() => {
    if (existing) {
      reset({
        title: existing.title,
        project_id: existing.project_id ?? '',
        assignee_profile_id: existing.assignee_profile_id ?? '',
        status_id: existing.status_id,
        deadline: toDatetimeLocalValue(existing.deadline),
        starts_at: toDatetimeLocalValue(existing.starts_at),
        deliverable_text: existing.deliverable_text ?? '',
        term_type_id: existing.term_type_id ?? '',
        quadrant_id: existing.quadrant_id ?? '',
        recurrence_id: existing.recurrence_id ?? '',
      })
    }
  }, [existing, reset])

  useEffect(() => {
    if (existingDeliverableTypes) {
      setSelectedDeliverableTypes(new Set(existingDeliverableTypes))
    }
  }, [existingDeliverableTypes])

  function toggleDeliverableType(id: string, checked: boolean) {
    setSelectedDeliverableTypes((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  async function performSave(values: FormValues) {
    const payload = {
      title: values.title,
      project_id: values.project_id || null,
      assignee_profile_id: values.assignee_profile_id || null,
      status_id: values.status_id,
      deadline: values.deadline ? new Date(values.deadline).toISOString() : null,
      starts_at: values.starts_at ? new Date(values.starts_at).toISOString() : null,
      deliverable_text: values.deliverable_text || null,
      term_type_id: values.term_type_id || null,
      quadrant_id: values.quadrant_id || null,
      recurrence_id: values.recurrence_id || null,
    }

    let currentTaskId = effectiveId
    if (currentTaskId) {
      const { error } = await supabase.from('tasks').update(payload).eq('id', currentTaskId)
      if (error) throw error
    } else {
      const { data, error } = await supabase
        .from('tasks')
        .insert({ ...payload, created_by: profile?.id ?? null })
        .select('id')
        .single()
      if (error) throw error
      currentTaskId = data.id
      setDraftId(currentTaskId)
    }

    await supabase.from('task_deliverable_types').delete().eq('task_id', currentTaskId)
    if (selectedDeliverableTypes.size > 0) {
      await supabase.from('task_deliverable_types').insert(
        [...selectedDeliverableTypes].map((deliverable_type_id) => ({
          task_id: currentTaskId!,
          deliverable_type_id,
        }))
      )
    }

    // List queries only here -- other views (kanban, cabinet, workload) can
    // refresh live. NOT this sheet's own ['task-detail', id] / deliverable
    // types query: invalidating those while the sheet is still open would
    // refetch mid-edit and re-trigger the populate-from-server effects
    // below, reverting whatever the user just clicked (quadrant, ish turi)
    // before it even got saved. Those two are invalidated only in
    // mutation.onSuccess, once the sheet is actually closing.
    queryClient.invalidateQueries({ queryKey: ['tasks'] })
    queryClient.invalidateQueries({ queryKey: ['tasks-kanban'] })
    queryClient.invalidateQueries({ queryKey: ['cabinet-tasks'] })
    queryClient.invalidateQueries({ queryKey: ['workload'] })

    return currentTaskId
  }

  // DM the assignee every time the sheet closes with an assignee set --
  // explicit button, X, Escape, or backdrop click all count (autosave alone
  // never should, mid-edit). The DB function itself holds the
  // notify-endpoint secret; the client only ever calls it by name.
  function notifyAssignee(savedTaskId: string, values: FormValues) {
    if (!values.assignee_profile_id) return
    supabase.rpc('notify_task_assigned_now', { p_task_id: savedTaskId }).then(({ error }) => {
      if (error) console.error('notify_task_assigned_now failed', error)
    })
  }

  const mutation = useMutation({
    mutationFn: performSave,
    onSuccess: (currentTaskId, values) => {
      toast.success(isEdit ? t('team.saved') : 'Задача создана')
      queryClient.invalidateQueries({ queryKey: ['task-detail', taskId] })
      queryClient.invalidateQueries({ queryKey: ['task_deliverable_types', taskId] })
      notifyAssignee(currentTaskId, values)
      onOpenChange(false)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  // Closing via X / Escape / backdrop click skips the submit button (and
  // its zod validation) entirely -- but the task is already saved by
  // autosave, so this just flushes the latest values and fires the same
  // notify, silently (no toast/spinner) since it's not a user-initiated
  // "save" action from their point of view.
  function handleDialogOpenChange(nextOpen: boolean) {
    if (!nextOpen && open && canAutosaveTask) {
      const values = watch()
      performSave(values)
        .then((currentTaskId) => notifyAssignee(currentTaskId, values))
        .catch((err) => console.error('flush-on-close save failed', err))
    }
    onOpenChange(nextOpen)
  }

  const watchedTask = watch()
  // project_id is only required here for the create path -- RLS on insert
  // rejects a project-less task from anyone without CEO/projects.manage, but
  // an existing task without a project can still autosave its other fields.
  const canAutosaveTask = !!(
    watchedTask.title &&
    watchedTask.status_id &&
    (effectiveId || watchedTask.project_id)
  )
  const autosaveStatus = useAutosave(
    watchedTask,
    async (values) => {
      // A plain assignee's disabled fields are sent back unchanged, same as
      // the manual save path today -- the DB trigger only rejects an actual
      // change to those columns, so this is no riskier than clicking Save.
      if (!canAutosaveTask) return
      await performSave(values)
    },
    { enabled: open, resetKey: taskId ?? existing?.updated_at ?? null }
  )

  const addSubtask = useMutation({
    mutationFn: async () => {
      if (!newSubtask.trim() || !taskId) return
      const { error } = await supabase
        .from('task_items')
        .insert({ task_id: taskId, title: newSubtask.trim(), sort_order: subtasks?.length ?? 0 })
      if (error) throw error
    },
    onSuccess: () => {
      setNewSubtask('')
      queryClient.invalidateQueries({ queryKey: ['task_items', taskId] })
      queryClient.invalidateQueries({ queryKey: ['task-detail', taskId] })
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const toggleSubtask = useMutation({
    mutationFn: async ({ id, is_done }: { id: string; is_done: boolean }) => {
      const { error } = await supabase.from('task_items').update({ is_done }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task_items', taskId] })
      queryClient.invalidateQueries({ queryKey: ['task-detail', taskId] })
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
  })

  const deleteSubtask = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('task_items').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task_items', taskId] })
      queryClient.invalidateQueries({ queryKey: ['task-detail', taskId] })
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
  })

  const addComment = useMutation({
    mutationFn: async () => {
      if (!newComment.trim() || !taskId || !profile) return
      const { error } = await supabase
        .from('task_comments')
        .insert({ task_id: taskId, author_profile_id: profile.id, body: newComment.trim() })
      if (error) throw error
    },
    onSuccess: () => {
      setNewComment('')
      queryClient.invalidateQueries({ queryKey: ['task_comments', taskId] })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? t('tasks.details') : t('tasks.newTask')}</DialogTitle>
          {autosaveStatus !== 'idle' && (
            <p className="text-xs text-muted-foreground">
              {autosaveStatus === 'saving' && t('common.saving')}
              {autosaveStatus === 'saved' && t('common.saved')}
              {autosaveStatus === 'error' && t('common.saveError')}
            </p>
          )}
        </DialogHeader>
        <form
          onSubmit={handleSubmit((values) => mutation.mutate(values))}
          className="flex flex-col gap-4"
        >
          {isOwnTaskOnly && (
            <p className="rounded-md bg-muted/60 px-2.5 py-1.5 text-xs text-muted-foreground">
              {t('tasks.assigneeReadOnlyHint')}
            </p>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="title">{t('tasks.title')}</Label>
            <Input id="title" disabled={isOwnTaskOnly} {...register('title')} />
            {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>{t('projects.title')}</Label>
            <Select
              disabled={isOwnTaskOnly}
              value={watch('project_id')}
              onValueChange={(v: string | null) => setValue('project_id', v ?? '')}
            >
              <SelectTrigger>
                <SelectValue placeholder="—">
                  {() => projects?.find((p) => p.id === watch('project_id'))?.name}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {projects?.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>{t('tasks.assignee')}</Label>
            <div className={cn((isOwnTaskOnly || assigneeLockedToSelf) && 'pointer-events-none opacity-60')}>
              <Combobox
                options={(assignees ?? []).map((a) => ({ value: a.id, label: a.full_name }))}
                value={watch('assignee_profile_id') ?? ''}
                onChange={(v) => setValue('assignee_profile_id', v)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>{t('tasks.termType')}</Label>
            <div className="flex gap-2">
              {termTypes?.map((tt) => (
                <button
                  key={tt.id}
                  type="button"
                  disabled={isOwnTaskOnly}
                  onClick={() => setValue('term_type_id', tt.id)}
                  className={cn(
                    'flex-1 rounded-lg border px-2 py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                    watch('term_type_id') === tt.id
                      ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200'
                      : 'border-border text-muted-foreground hover:bg-muted'
                  )}
                >
                  {pickLabel(tt, i18n.language)}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">{t('tasks.termAutoHint')}</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>{t('tasks.eisenhower')}</Label>
            <div className="grid grid-cols-2 gap-2">
              {quadrants?.map((q) => (
                <button
                  key={q.id}
                  type="button"
                  disabled={isOwnTaskOnly}
                  onClick={() => setValue('quadrant_id', q.id)}
                  className={cn(
                    'rounded-lg border px-2 py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                    watch('quadrant_id') === q.id
                      ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200'
                      : 'border-border text-muted-foreground hover:bg-muted'
                  )}
                >
                  {pickLabel(q, i18n.language)}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>{t('tasks.status')}</Label>
            <Select
              value={watch('status_id')}
              onValueChange={(v: string | null) => setValue('status_id', v ?? '')}
            >
              <SelectTrigger>
                <SelectValue placeholder="—">
                  {() => pickLabel(statuses?.find((s) => s.id === watch('status_id')), i18n.language)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {statuses?.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {pickLabel(s, i18n.language)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.status_id && (
              <p className="text-xs text-destructive">{errors.status_id.message}</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>{t('payroll.deliverableType')}</Label>
            <div className="flex flex-wrap gap-3 rounded-lg border border-border p-3">
              {deliverableTypes?.map((d) => (
                <div key={d.id} className="flex items-center gap-1.5">
                  <Checkbox
                    id={`deliverable-${d.id}`}
                    disabled={isOwnTaskOnly}
                    checked={selectedDeliverableTypes.has(d.id)}
                    onCheckedChange={(checked) => toggleDeliverableType(d.id, checked === true)}
                  />
                  <Label htmlFor={`deliverable-${d.id}`} className="font-normal">
                    {pickLabel(d, i18n.language)}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="starts_at">{t('tasks.startsAt')}</Label>
              <DateTime24Field
                id="starts_at"
                value={watch('starts_at') ?? ''}
                onChange={(v) => setValue('starts_at', v)}
                disabled={isOwnTaskOnly}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="deadline">{t('tasks.deadline')}</Label>
              <DateTime24Field
                id="deadline"
                value={watch('deadline') ?? ''}
                onChange={(v) => {
                  setValue('deadline', v)
                  const slug = suggestTermSlug(v)
                  const match = termTypes?.find((tt) => tt.slug === slug)
                  if (match) setValue('term_type_id', match.id)
                }}
                disabled={isOwnTaskOnly}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="deliverable_text">{t('tasks.deliverable')}</Label>
            <Textarea id="deliverable_text" rows={2} disabled={isOwnTaskOnly} {...register('deliverable_text')} />
          </div>

          {isEdit && (
            <div className="flex flex-col gap-2">
              <Label>{t('tasks.subtasks')}</Label>
              <div className="flex flex-col gap-1.5">
                {subtasks?.map((st) => (
                  <div key={st.id} className="flex items-center gap-2 rounded-md bg-muted/40 px-2 py-1.5">
                    <Checkbox
                      checked={st.is_done}
                      onCheckedChange={(checked) => toggleSubtask.mutate({ id: st.id, is_done: checked === true })}
                    />
                    <span className={cn('flex-1 text-sm', st.is_done && 'text-muted-foreground line-through')}>
                      {st.title}
                    </span>
                    {/* PM/CEO only -- how long this subtask sat unchecked
                        before completion, mirrors the statusDurations block
                        below for whole-task status timing. */}
                    {canManageTask && st.completed_at && (
                      <span className="text-[10px] text-muted-foreground">
                        {formatDurationMs(new Date(st.completed_at).getTime() - new Date(st.created_at).getTime())}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => deleteSubtask.mutate(st.id)}
                      className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  value={newSubtask}
                  onChange={(e) => setNewSubtask(e.target.value)}
                  placeholder={t('tasks.subtaskPlaceholder')}
                  className="h-8"
                />
                <Button
                  type="button"
                  size="sm"
                  disabled={!newSubtask.trim() || addSubtask.isPending}
                  onClick={() => addSubtask.mutate()}
                >
                  <Plus className="size-3.5" />
                </Button>
              </div>
            </div>
          )}

          {isEdit && (
            <div className="flex flex-col gap-2">
              <Label>{t('tasks.comments')}</Label>
              <div className="flex flex-col gap-2">
                {comments?.map((c) => (
                  <div key={c.id} className="rounded-md bg-muted/40 px-2.5 py-1.5 text-sm">
                    <p>{c.body}</p>
                    <p className="text-[10px] text-muted-foreground">{formatLocalDateTime(c.created_at, i18n.language)}</p>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder={t('tasks.commentPlaceholder')}
                  className="h-8"
                />
                <Button
                  type="button"
                  size="sm"
                  disabled={!newComment.trim() || addComment.isPending}
                  onClick={() => addComment.mutate()}
                >
                  <Plus className="size-3.5" />
                </Button>
              </div>
            </div>
          )}

          {isEdit && canManageTask && statusLog && statusLog.length > 1 && (
            <div className="flex flex-col gap-1.5">
              <Label>{t('tasks.statusDurations')}</Label>
              <div className="flex flex-col gap-1 rounded-lg border border-border p-2">
                {statusLog.slice(1).map((entry, i) => {
                  const prev = statusLog[i]
                  const fromLabel = pickLabel(statuses?.find((s) => s.id === prev.status_id), i18n.language)
                  const toLabel = pickLabel(statuses?.find((s) => s.id === entry.status_id), i18n.language)
                  const durationMs = new Date(entry.changed_at).getTime() - new Date(prev.changed_at).getTime()
                  return (
                    <p key={entry.changed_at} className="text-xs text-muted-foreground">
                      {fromLabel} → {toLabel}: <span className="font-medium text-foreground">{formatDurationMs(durationMs)}</span>
                    </p>
                  )
                })}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="submit" disabled={isSubmitting || mutation.isPending}>
              {effectiveId ? t('common.done') : t('common.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function NewTaskButton({ defaultProjectId }: { defaultProjectId?: string }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus />
        {t('tasks.newTask')}
      </Button>
      <TaskSheet open={open} onOpenChange={setOpen} taskId={null} defaultProjectId={defaultProjectId} />
    </>
  )
}
