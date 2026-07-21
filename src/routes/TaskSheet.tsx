import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/auth/AuthProvider'
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
import { Plus, X } from 'lucide-react'
import { pickLabel, formatLocalDateTime } from '@/lib/localizedLabel'
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
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const isEdit = !!taskId
  const [newSubtask, setNewSubtask] = useState('')
  const [newComment, setNewComment] = useState('')
  const [selectedDeliverableTypes, setSelectedDeliverableTypes] = useState<Set<string>>(new Set())

  const { data: statuses } = useQuery({
    queryKey: ['task_statuses'],
    queryFn: async () => {
      const { data, error } = await supabase.from('task_statuses').select('id, label_ru, label_uz').order('sort_order')
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
      const { data, error } = await supabase.from('projects').select('id, name')
      if (error) throw error
      return data
    },
  })

  const { data: assignees } = useQuery({
    queryKey: ['assignees'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('id, full_name')
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

  const { data: workload } = useQuery({
    queryKey: ['workload'],
    queryFn: async () => {
      const { data, error } = await supabase.from('v_employee_workload').select('*')
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
        .select('id, title, is_done, sort_order')
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
      reset({ project_id: defaultProjectId ?? '' })
      setSelectedDeliverableTypes(new Set())
    }
  }, [open, isEdit, defaultProjectId, reset])

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

  const selectedAssigneeId = watch('assignee_profile_id')
  const selectedWorkload = workload?.find((w) => w.profile_id === selectedAssigneeId)
  const isOverWip = !!selectedWorkload && selectedWorkload.open_task_count >= selectedWorkload.max_open_tasks

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
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
      }

      let currentTaskId = taskId
      if (isEdit) {
        const { error } = await supabase.from('tasks').update(payload).eq('id', taskId!)
        if (error) throw error
      } else {
        const { data, error } = await supabase
          .from('tasks')
          .insert({ ...payload, created_by: profile?.id ?? null })
          .select('id')
          .single()
        if (error) throw error
        currentTaskId = data.id
      }

      await supabase.from('task_deliverable_types').delete().eq('task_id', currentTaskId!)
      if (selectedDeliverableTypes.size > 0) {
        await supabase.from('task_deliverable_types').insert(
          [...selectedDeliverableTypes].map((deliverable_type_id) => ({
            task_id: currentTaskId!,
            deliverable_type_id,
          }))
        )
      }
    },
    onSuccess: () => {
      toast.success(isEdit ? t('team.saved') : 'Задача создана')
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['tasks-kanban'] })
      queryClient.invalidateQueries({ queryKey: ['cabinet-tasks'] })
      queryClient.invalidateQueries({ queryKey: ['workload'] })
      queryClient.invalidateQueries({ queryKey: ['task-detail', taskId] })
      queryClient.invalidateQueries({ queryKey: ['task_deliverable_types', taskId] })
      onOpenChange(false)
    },
    onError: (err: Error) => toast.error(err.message),
  })

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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? t('tasks.details') : t('tasks.newTask')}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={handleSubmit((values) => mutation.mutate(values))}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="title">{t('tasks.title')}</Label>
            <Input id="title" {...register('title')} />
            {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>{t('projects.title')}</Label>
            <Select
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
            <Select
              value={watch('assignee_profile_id')}
              onValueChange={(v: string | null) => setValue('assignee_profile_id', v ?? '')}
            >
              <SelectTrigger>
                <SelectValue placeholder="—">
                  {() => assignees?.find((a) => a.id === watch('assignee_profile_id'))?.full_name}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {assignees?.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isOverWip && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                ⚠ {selectedWorkload?.open_task_count}/{selectedWorkload?.max_open_tasks}{' '}
                {t('workload.openTasks').toLowerCase()} — {t('workload.overloaded').toLowerCase()}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>{t('tasks.termType')}</Label>
            <div className="flex gap-2">
              {termTypes?.map((tt) => (
                <button
                  key={tt.id}
                  type="button"
                  onClick={() => setValue('term_type_id', tt.id)}
                  className={cn(
                    'flex-1 rounded-lg border px-2 py-2 text-xs font-medium transition-colors',
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
                  onClick={() => setValue('quadrant_id', q.id)}
                  className={cn(
                    'rounded-lg border px-2 py-2 text-xs font-medium transition-colors',
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
              <Input id="starts_at" type="datetime-local" {...register('starts_at')} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="deadline">{t('tasks.deadline')}</Label>
              <Input
                id="deadline"
                type="datetime-local"
                {...register('deadline', {
                  onChange: (e) => {
                    const slug = suggestTermSlug(e.target.value)
                    const match = termTypes?.find((tt) => tt.slug === slug)
                    if (match) setValue('term_type_id', match.id)
                  },
                })}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="deliverable_text">{t('tasks.deliverable')}</Label>
            <Textarea id="deliverable_text" rows={2} {...register('deliverable_text')} />
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

          <DialogFooter>
            <Button type="submit" disabled={isSubmitting || mutation.isPending}>
              {isEdit ? t('tasks.save') : t('common.create')}
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
