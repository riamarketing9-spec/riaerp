import { useState } from 'react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog'
import { Plus } from 'lucide-react'

const schema = z.object({
  title: z.string().min(1, 'Обязательное поле'),
  project_id: z.string().optional(),
  assignee_profile_id: z.string().optional(),
  status_id: z.string().min(1, 'Обязательное поле'),
  priority_id: z.string().optional(),
  deadline: z.string().optional(),
  deliverable_text: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

export function CreateTaskDialog() {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()

  const { data: statuses } = useQuery({
    queryKey: ['task_statuses'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('task_statuses')
        .select('id, label_ru')
        .order('sort_order')
      if (error) throw error
      return data
    },
  })

  const { data: priorities } = useQuery({
    queryKey: ['priorities'],
    queryFn: async () => {
      const { data, error } = await supabase.from('priorities').select('id, label_ru')
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

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const { error } = await supabase.from('tasks').insert({
        title: values.title,
        project_id: values.project_id || null,
        assignee_profile_id: values.assignee_profile_id || null,
        status_id: values.status_id,
        priority_id: values.priority_id || null,
        deadline: values.deadline ? new Date(values.deadline).toISOString() : null,
        deliverable_text: values.deliverable_text || null,
        created_by: profile?.id ?? null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Задача создана')
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['cabinet-tasks'] })
      queryClient.invalidateQueries({ queryKey: ['workload'] })
      reset()
      setOpen(false)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button>
            <Plus />
            {t('tasks.newTask')}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('tasks.newTask')}</DialogTitle>
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
            <Select onValueChange={(v: string | null) => setValue('project_id', v ?? '')}>
              <SelectTrigger>
                <SelectValue placeholder="—" />
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
            <Select onValueChange={(v: string | null) => setValue('assignee_profile_id', v ?? '')}>
              <SelectTrigger>
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                {assignees?.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>{t('tasks.status')}</Label>
              <Select onValueChange={(v: string | null) => setValue('status_id', v ?? '')}>
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {statuses?.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.label_ru}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.status_id && (
                <p className="text-xs text-destructive">{errors.status_id.message}</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>{t('tasks.priority')}</Label>
              <Select onValueChange={(v: string | null) => setValue('priority_id', v ?? '')}>
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {priorities?.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.label_ru}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="deadline">{t('tasks.deadline')}</Label>
            <Input id="deadline" type="date" {...register('deadline')} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="deliverable_text">{t('tasks.deliverable')}</Label>
            <Textarea id="deliverable_text" rows={2} {...register('deliverable_text')} />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={isSubmitting || mutation.isPending}>
              {t('common.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
