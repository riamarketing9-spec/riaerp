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
import { pickLabel } from '@/lib/localizedLabel'

const schema = z.object({
  name: z.string().min(1, 'Обязательное поле'),
  project_type_id: z.string().min(1, 'Обязательное поле'),
  status_id: z.string().min(1, 'Обязательное поле'),
  pm_profile_id: z.string().min(1, 'Обязательное поле'),
  goal: z.string().optional(),
  target_audience: z.string().optional(),
  billing_day: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

export function CreateProjectDialog() {
  const { t, i18n } = useTranslation()
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()

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
      const { data, error } = await supabase
        .from('project_statuses')
        .select('id, label_ru, label_uz')
        .order('sort_order')
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

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const { error } = await supabase.from('projects').insert({
        name: values.name,
        project_type_id: values.project_type_id,
        status_id: values.status_id,
        pm_profile_id: values.pm_profile_id,
        goal: values.goal || null,
        target_audience: values.target_audience || null,
        billing_day: values.billing_day ? Number(values.billing_day) : null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Проект создан')
      queryClient.invalidateQueries({ queryKey: ['projects'] })
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
            {t('projects.newProject')}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('projects.newProject')}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={handleSubmit((values) => mutation.mutate(values))}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">{t('projects.name')}</Label>
            <Input id="name" {...register('name')} />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label>{t('projects.type')}</Label>
              <Select onValueChange={(v: string | null) => setValue('project_type_id', v ?? '')}>
                <SelectTrigger>
                  <SelectValue placeholder="—">
                    {() => pickLabel(projectTypes?.find((pt) => pt.id === watch('project_type_id')), i18n.language)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {projectTypes?.map((pt) => (
                    <SelectItem key={pt.id} value={pt.id}>
                      {pickLabel(pt, i18n.language)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.project_type_id && (
                <p className="text-xs text-destructive">{errors.project_type_id.message}</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>{t('projects.status')}</Label>
              <Select onValueChange={(v: string | null) => setValue('status_id', v ?? '')}>
                <SelectTrigger>
                  <SelectValue placeholder="—">
                    {() => pickLabel(projectStatuses?.find((ps) => ps.id === watch('status_id')), i18n.language)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {projectStatuses?.map((ps) => (
                    <SelectItem key={ps.id} value={ps.id}>
                      {pickLabel(ps, i18n.language)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.status_id && (
                <p className="text-xs text-destructive">{errors.status_id.message}</p>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>{t('projects.pm')}</Label>
            <Select onValueChange={(v: string | null) => setValue('pm_profile_id', v ?? '')}>
              <SelectTrigger>
                <SelectValue placeholder="—">
                  {() => managers?.find((m) => m.id === watch('pm_profile_id'))?.full_name}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {managers?.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.pm_profile_id && (
              <p className="text-xs text-destructive">{errors.pm_profile_id.message}</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="goal">{t('projects.goal')}</Label>
            <Textarea id="goal" rows={2} {...register('goal')} />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="target_audience">{t('projects.audience')}</Label>
              <Input id="target_audience" {...register('target_audience')} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="billing_day">{t('projects.billingDay')}</Label>
              <Input id="billing_day" type="number" min={1} max={31} {...register('billing_day')} />
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
