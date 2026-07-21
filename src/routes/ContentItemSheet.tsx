import { useEffect } from 'react'
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
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { pickLabel } from '@/lib/localizedLabel'

const schema = z.object({
  project_id: z.string().min(1, 'Обязательное поле'),
  topic: z.string().min(1, 'Обязательное поле'),
  format_id: z.string().min(1, 'Обязательное поле'),
  status_id: z.string().min(1, 'Обязательное поле'),
  deliverable_type_id: z.string().optional(),
  shooter_profile_id: z.string().optional(),
  editor_profile_id: z.string().optional(),
  responsible_profile_id: z.string().optional(),
  shoot_date: z.string().optional(),
  publish_date: z.string().optional(),
  script: z.string().optional(),
  tor_text: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

export function ContentItemSheet({
  open,
  onOpenChange,
  itemId,
  defaultProjectId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  itemId: string | null
  defaultProjectId?: string
}) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const isEdit = !!itemId

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
      const { data, error } = await supabase.from('content_formats').select('id, label_ru, label_uz')
      if (error) throw error
      return data
    },
  })
  const { data: statuses } = useQuery({
    queryKey: ['content_statuses'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('content_statuses')
        .select('id, label_ru, label_uz')
        .order('sort_order')
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
  const { data: profiles } = useQuery({
    queryKey: ['profiles-lookup'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('id, full_name')
      if (error) throw error
      return data
    },
  })
  const { data: platforms } = useQuery({
    queryKey: ['platforms'],
    queryFn: async () => {
      const { data, error } = await supabase.from('platforms').select('id, label_ru, label_uz')
      if (error) throw error
      return data
    },
  })

  const { data: existing } = useQuery({
    queryKey: ['content_plan_item', itemId],
    enabled: !!itemId && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('content_plan_items')
        .select('*')
        .eq('id', itemId!)
        .single()
      if (error) throw error
      return data
    },
  })

  const { data: existingPlatformIds } = useQuery({
    queryKey: ['content_plan_platforms', itemId],
    enabled: !!itemId && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('content_plan_platforms')
        .select('platform_id')
        .eq('content_plan_item_id', itemId!)
      if (error) throw error
      return data.map((r) => r.platform_id)
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

  const selectedPlatforms = watch('_platforms' as never) as string[] | undefined

  useEffect(() => {
    if (open && !isEdit) {
      reset({ project_id: defaultProjectId ?? '' })
      setValue('_platforms' as never, [] as never)
    }
  }, [open, isEdit, defaultProjectId, reset, setValue])

  useEffect(() => {
    if (existing) {
      reset({
        project_id: existing.project_id,
        topic: existing.topic,
        format_id: existing.format_id,
        status_id: existing.status_id,
        deliverable_type_id: existing.deliverable_type_id ?? '',
        shooter_profile_id: existing.shooter_profile_id ?? '',
        editor_profile_id: existing.editor_profile_id ?? '',
        responsible_profile_id: existing.responsible_profile_id ?? '',
        shoot_date: existing.shoot_date ?? '',
        publish_date: existing.publish_date ?? '',
        script: existing.script ?? '',
        tor_text: existing.tor_text ?? '',
      })
    }
  }, [existing, reset])

  useEffect(() => {
    if (existingPlatformIds) {
      setValue('_platforms' as never, existingPlatformIds as never)
    }
  }, [existingPlatformIds, setValue])

  function togglePlatform(id: string, checked: boolean) {
    const current = selectedPlatforms ?? []
    setValue(
      '_platforms' as never,
      (checked ? [...current, id] : current.filter((p) => p !== id)) as never
    )
  }

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const payload = {
        project_id: values.project_id,
        topic: values.topic,
        format_id: values.format_id,
        status_id: values.status_id,
        deliverable_type_id: values.deliverable_type_id || null,
        shooter_profile_id: values.shooter_profile_id || null,
        editor_profile_id: values.editor_profile_id || null,
        responsible_profile_id: values.responsible_profile_id || null,
        shoot_date: values.shoot_date || null,
        publish_date: values.publish_date || null,
        script: values.script || null,
        tor_text: values.tor_text || null,
      }

      let id = itemId
      if (isEdit) {
        const { error } = await supabase.from('content_plan_items').update(payload).eq('id', itemId!)
        if (error) throw error
      } else {
        const { data, error } = await supabase
          .from('content_plan_items')
          .insert(payload)
          .select('id')
          .single()
        if (error) throw error
        id = data.id
      }

      await supabase.from('content_plan_platforms').delete().eq('content_plan_item_id', id!)
      const platformIds = selectedPlatforms ?? []
      if (platformIds.length > 0) {
        await supabase.from('content_plan_platforms').insert(
          platformIds.map((platform_id) => ({ content_plan_item_id: id!, platform_id }))
        )
      }
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Сохранено' : 'Добавлено в контент-план')
      queryClient.invalidateQueries({ queryKey: ['content_plan_items'] })
      queryClient.invalidateQueries({ queryKey: ['content_plan_platforms', itemId] })
      queryClient.invalidateQueries({ queryKey: ['content_plan_platforms-all'] })
      onOpenChange(false)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? t('contentPlan.details') : t('contentPlan.newItem')}</DialogTitle>
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

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label>{t('contentPlan.format')}</Label>
              <Select
                value={watch('format_id')}
                onValueChange={(v: string | null) => setValue('format_id', v ?? '')}
              >
                <SelectTrigger>
                  <SelectValue placeholder="—">
                    {() => pickLabel(formats?.find((f) => f.id === watch('format_id')), i18n.language)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {formats?.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {pickLabel(f, i18n.language)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t('contentPlan.status')}</Label>
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
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>{t('contentPlan.platforms')}</Label>
            <div className="flex flex-wrap gap-3">
              {platforms?.map((p) => (
                <div key={p.id} className="flex items-center gap-1.5">
                  <Checkbox
                    id={`platform-${p.id}`}
                    checked={(selectedPlatforms ?? []).includes(p.id)}
                    onCheckedChange={(checked) => togglePlatform(p.id, checked === true)}
                  />
                  <Label htmlFor={`platform-${p.id}`} className="font-normal">
                    {pickLabel(p, i18n.language)}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label>{t('contentPlan.shooter')}</Label>
              <Select
                value={watch('shooter_profile_id')}
                onValueChange={(v: string | null) => setValue('shooter_profile_id', v ?? '')}
              >
                <SelectTrigger>
                  <SelectValue placeholder="—">
                    {() => profiles?.find((p) => p.id === watch('shooter_profile_id'))?.full_name}
                  </SelectValue>
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
              <Select
                value={watch('editor_profile_id')}
                onValueChange={(v: string | null) => setValue('editor_profile_id', v ?? '')}
              >
                <SelectTrigger>
                  <SelectValue placeholder="—">
                    {() => profiles?.find((p) => p.id === watch('editor_profile_id'))?.full_name}
                  </SelectValue>
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

          <div className="flex flex-col gap-1.5">
            <Label>{t('payroll.deliverableType')}</Label>
            <Select
              value={watch('deliverable_type_id')}
              onValueChange={(v: string | null) => setValue('deliverable_type_id', v ?? '')}
            >
              <SelectTrigger>
                <SelectValue placeholder="—">
                  {() =>
                    pickLabel(
                      deliverableTypes?.find((d) => d.id === watch('deliverable_type_id')),
                      i18n.language
                    )
                  }
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

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="shoot_date">{t('contentPlan.shootDate')}</Label>
              <Input id="shoot_date" type="date" {...register('shoot_date')} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="publish_date">{t('contentPlan.publishDate')}</Label>
              <Input id="publish_date" type="date" {...register('publish_date')} />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="script">{t('contentPlan.script')}</Label>
            <Textarea id="script" rows={4} {...register('script')} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tor_text">{t('contentPlan.tor')}</Label>
            <Textarea id="tor_text" rows={3} {...register('tor_text')} />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={isSubmitting || mutation.isPending}>
              {isEdit ? t('contentPlan.save') : t('common.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
