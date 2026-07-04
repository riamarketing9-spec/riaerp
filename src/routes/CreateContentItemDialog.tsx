import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabaseClient'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
  project_id: z.string().min(1, 'Обязательное поле'),
  topic: z.string().min(1, 'Обязательное поле'),
  format_id: z.string().min(1, 'Обязательное поле'),
  status_id: z.string().min(1, 'Обязательное поле'),
  shooter_profile_id: z.string().optional(),
  editor_profile_id: z.string().optional(),
  shoot_date: z.string().optional(),
  publish_date: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

export function CreateContentItemDialog() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()

  const { data: projects } = useQuery({
    queryKey: ['projects-lookup'],
    queryFn: async () => {
      const { data, error } = await supabase.from('projects').select('id, name')
      if (error) throw error
      return data
    },
  })
  const { data: formats } = useQuery({
    queryKey: ['content_formats'],
    queryFn: async () => {
      const { data, error } = await supabase.from('content_formats').select('id, label_ru')
      if (error) throw error
      return data
    },
  })
  const { data: statuses } = useQuery({
    queryKey: ['content_statuses'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('content_statuses')
        .select('id, label_ru')
        .order('sort_order')
      if (error) throw error
      return data
    },
  })
  const { data: profiles } = useQuery({
    queryKey: ['profiles-lookup'],
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
      const { error } = await supabase.from('content_plan_items').insert({
        project_id: values.project_id,
        topic: values.topic,
        format_id: values.format_id,
        status_id: values.status_id,
        shooter_profile_id: values.shooter_profile_id || null,
        editor_profile_id: values.editor_profile_id || null,
        shoot_date: values.shoot_date || null,
        publish_date: values.publish_date || null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Добавлено в контент-план')
      queryClient.invalidateQueries({ queryKey: ['content_plan_items'] })
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
            {t('contentPlan.newItem')}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('contentPlan.newItem')}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={handleSubmit((values) => mutation.mutate(values))}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="topic">{t('contentPlan.topic')}</Label>
            <Input id="topic" {...register('topic')} />
            {errors.topic && <p className="text-xs text-destructive">{errors.topic.message}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>{t('contentPlan.project')}</Label>
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
            {errors.project_id && (
              <p className="text-xs text-destructive">{errors.project_id.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>{t('contentPlan.format')}</Label>
              <Select onValueChange={(v: string | null) => setValue('format_id', v ?? '')}>
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {formats?.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.label_ru}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.format_id && (
                <p className="text-xs text-destructive">{errors.format_id.message}</p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t('contentPlan.status')}</Label>
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
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>{t('contentPlan.shooter')}</Label>
              <Select onValueChange={(v: string | null) => setValue('shooter_profile_id', v ?? '')}>
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {profiles?.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t('contentPlan.editor')}</Label>
              <Select onValueChange={(v: string | null) => setValue('editor_profile_id', v ?? '')}>
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {profiles?.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="shoot_date">{t('contentPlan.shootDate')}</Label>
              <Input id="shoot_date" type="date" {...register('shoot_date')} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="publish_date">{t('contentPlan.publishDate')}</Label>
              <Input id="publish_date" type="date" {...register('publish_date')} />
            </div>
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
