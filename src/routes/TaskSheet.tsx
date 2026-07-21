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
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet'
import { Plus, X } from 'lucide-react'
import { pickLabel, formatLocalDate } from '@/lib/localizedLabel'
import { cn } from '@/lib/utils'

const schema = z.object({
  title: z.string().min(1, 'Обязательное поле'),
  project_id: z.string().optional(),
  assignee_profile_id: z.string().optional(),
  status_id: z.string().min(1, 'Обязательное поле'),
  deadline: z.string().optional(),
  starts_at: z.string().optional(),
  deliverable_text: z.string().optional(),
  deliverable_type_id: z.string().optional(),
  blocker_text: z.string().optional(),
  term_type_id: z.string().optional(),
  is_important: z.boolean(),
})

type FormValues = z.infer<typeof schema>

function suggestTermSlug(dateStr: string): 'qisqa' | 'orta' | 'uzoq' | null {
  if (!dateStr) return null
  const days = (new Date(dateStr).getTime() - Date.now()) / (24 * 60 * 60 * 1000)
  if (days <= 3) return 'qisqa'
  if (days <= 10) return 'orta'
  return 'uzoq'
}

const QUADRANTS = {
  do_now: { key: 'quadrantDoNow', variant: 'destructive' as const },
  schedule: { key: 'quadrantSchedule', variant: 'default' as const },
  delegate: { key: 'quadrantDelegate', variant: 'secondary' as const },
  eliminate: { key: 'quadrantEliminate', variant: 'outline' as const },
}

function computeQuadrant(termSlug: string | undefined, isImportant: boolean) {
  const urgent = termSlug === 'qisqa'
  if (urgent && isImportant) return QUADRANTS.do_now
  if (!urgent && isImportant) return QUADRANTS.schedule
  if (urgent && !isImportant) return QUADRANTS.delegate
  return QUADRANTS.eliminate
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

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { is_important: false },
  })

  useEffect(() => {
    if (open && !isEdit) {
      reset({ project_id: defaultProjectId ?? '', is_important: false })
    }
  }, [open, isEdit, defaultProjectId, reset])

  useEffect(() => {
    if (existing) {
      reset({
        title: existing.title,
        project_id: existing.project_id ?? '',
        assignee_profile_id: existing.assignee_profile_id ?? '',
        status_id: existing.status_id,
        deadline: existing.deadline ? existing.deadline.slice(0, 10) : '',
        starts_at: existing.starts_at ? existing.starts_at.slice(0, 10) : '',
        deliverable_text: existing.deliverable_text ?? '',
        deliverable_type_id: existing.deliverable_type_id ?? '',
        blocker_text: existing.blocker_text ?? '',
        term_type_id: existing.term_type_id ?? '',
        is_important: existing.is_important,
      })
    }
  }, [existing, reset])

  const selectedAssigneeId = watch('assignee_profile_id')
  const selectedWorkload = workload?.find((w) => w.profile_id === selectedAssigneeId)
  const isOverWip = !!selectedWorkload && selectedWorkload.open_task_count >= selectedWorkload.max_open_tasks
  const selectedTerm = termTypes?.find((tt) => tt.id === watch('term_type_id'))
  const quadrant = computeQuadrant(selectedTerm?.slug, watch('is_important'))

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
        deliverable_type_id: values.deliverable_type_id || null,
        blocker_text: values.blocker_text || null,
        term_type_id: values.term_type_id || null,
        is_important: values.is_important,
      }

      if (isEdit) {
        const { error } = await supabase.from('tasks').update(payload).eq('id', taskId!)
        if (error) throw error
      } else {
        const { error } = await supabase.from('tasks').insert({ ...payload, created_by: profile?.id ?? null })
        if (error) throw error
      }
    },
    onSuccess: () => {
      toast.success(isEdit ? t('team.saved') : 'Задача создана')
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['tasks-kanban'] })
      queryClient.invalidateQueries({ queryKey: ['cabinet-tasks'] })
      queryClient.invalidateQueries({ queryKey: ['workload'] })
      queryClient.invalidateQueries({ queryKey: ['task-detail', taskId] })
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
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{isEdit ? t('tasks.details') : t('tasks.newTask')}</SheetTitle>
        </SheetHeader>
        <form
          onSubmit={handleSubmit((values) => mutation.mutate(values))}
          className="flex flex-col gap-4 px-4 pb-4"
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

          <div className="flex items-center gap-2">
            <Checkbox
              id="is_important"
              checked={watch('is_important')}
              onCheckedChange={(checked) => setValue('is_important', checked === true)}
            />
            <Label htmlFor="is_important" className="font-normal">
              {t('tasks.important')}
            </Label>
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">{t('tasks.importantHint')}</p>

          <div className="flex flex-col gap-1.5 rounded-lg border border-border p-3">
            <Label>{t('tasks.eisenhower')}</Label>
            <Badge variant={quadrant.variant} className="w-fit">
              {t(`tasks.${quadrant.key}`)}
            </Badge>
            <p className="text-xs text-muted-foreground">{t('tasks.eisenhowerHint')}</p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
              <Select
                value={watch('deliverable_type_id')}
                onValueChange={(v: string | null) => setValue('deliverable_type_id', v ?? '')}
              >
                <SelectTrigger>
                  <SelectValue placeholder="—">
                    {() => pickLabel(deliverableTypes?.find((d) => d.id === watch('deliverable_type_id')), i18n.language)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {deliverableTypes?.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {pickLabel(d, i18n.language)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="starts_at">{t('tasks.startsAt')}</Label>
              <Input id="starts_at" type="date" {...register('starts_at')} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="deadline">{t('tasks.deadline')}</Label>
              <Input
                id="deadline"
                type="date"
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

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="blocker_text">{t('tasks.blocker')}</Label>
            <Textarea id="blocker_text" rows={2} {...register('blocker_text')} />
          </div>

          {isEdit && (
            <div className="flex flex-col gap-2">
              <Label>{t('tasks.subtasks')}</Label>
              <p className="text-xs text-muted-foreground">{t('tasks.subtasksHint')}</p>
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
                    <p className="text-[10px] text-muted-foreground">{formatLocalDate(c.created_at, i18n.language)}</p>
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

          <SheetFooter className="px-0">
            <Button type="submit" disabled={isSubmitting || mutation.isPending}>
              {isEdit ? t('tasks.save') : t('common.create')}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
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
