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
import { pickLabel } from '@/lib/localizedLabel'
import { FileUpload } from '@/components/FileUpload'

const schema = z.object({
  name: z.string().min(1, 'Обязательное поле'),
  project_type_id: z.string().min(1, 'Обязательное поле'),
  status_id: z.string().min(1, 'Обязательное поле'),
  pm_profile_id: z.string().min(1, 'Обязательное поле'),
  assistant_pm_profile_id: z.string().optional(),
  client_id: z.string().optional(),
  goal: z.string().optional(),
  deliverables_text: z.string().optional(),
  target_audience: z.string().optional(),
  target_audience_voice_url: z.string().optional(),
  target_audience_file_url: z.string().optional(),
  billing_day: z.string().optional(),
  contract_url: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

export function CreateProjectDialog() {
  const { t, i18n } = useTranslation()
  const { isCeo } = useAuth()
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

  const { data: clients } = useQuery({
    queryKey: ['clients-lookup'],
    queryFn: async () => {
      const { data, error } = await supabase.from('clients').select('id, name')
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
      const { data: project, error } = await supabase
        .from('projects')
        .insert({
          name: values.name,
          project_type_id: values.project_type_id,
          status_id: values.status_id,
          pm_profile_id: values.pm_profile_id,
          client_id: values.client_id || null,
          goal: values.goal || null,
          deliverables_text: values.deliverables_text || null,
          target_audience: values.target_audience || null,
          target_audience_voice_url: values.target_audience_voice_url || null,
          target_audience_file_url: values.target_audience_file_url || null,
          billing_day: values.billing_day ? Number(values.billing_day) : null,
        })
        .select('id')
        .single()
      if (error) throw error

      if (values.assistant_pm_profile_id) {
        await supabase.from('project_members').insert({
          project_id: project.id,
          profile_id: values.assistant_pm_profile_id,
          role_on_project: 'assistant_pm',
        })
      }

      if (isCeo && values.contract_url && values.client_id) {
        const { data: contractType } = await supabase
          .from('contract_types')
          .select('id')
          .limit(1)
          .maybeSingle()
        if (contractType) {
          await supabase.from('contracts').insert({
            contract_type_id: contractType.id,
            party_client_id: values.client_id,
            storage_path: values.contract_url,
          })
        }
      }
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
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
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

          <div className="flex flex-col gap-1.5">
            <Label>{t('projects.client')}</Label>
            <Select value={watch('client_id')} onValueChange={(v: string | null) => setValue('client_id', v ?? '')}>
              <SelectTrigger>
                <SelectValue placeholder="—">
                  {() => clients?.find((c) => c.id === watch('client_id'))?.name}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {clients?.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label>{t('projects.type')}</Label>
              <Select
                value={watch('project_type_id')}
                onValueChange={(v: string | null) => setValue('project_type_id', v ?? '')}
              >
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
              <Select
                value={watch('status_id')}
                onValueChange={(v: string | null) => setValue('status_id', v ?? '')}
              >
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

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label>{t('projects.pm')}</Label>
              <Select
                value={watch('pm_profile_id')}
                onValueChange={(v: string | null) => setValue('pm_profile_id', v ?? '')}
              >
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
              <Label>{t('projects.assistantPm')}</Label>
              <Select
                value={watch('assistant_pm_profile_id')}
                onValueChange={(v: string | null) => setValue('assistant_pm_profile_id', v ?? '')}
              >
                <SelectTrigger>
                  <SelectValue placeholder="—">
                    {() => managers?.find((m) => m.id === watch('assistant_pm_profile_id'))?.full_name}
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
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="goal">{t('projects.goal')}</Label>
            <Textarea id="goal" rows={2} {...register('goal')} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="deliverables_text">{t('projects.deliverables')}</Label>
            <Textarea id="deliverables_text" rows={2} {...register('deliverables_text')} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="target_audience">{t('projects.audience')}</Label>
            <Textarea id="target_audience" rows={2} {...register('target_audience')} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{t('projects.audienceVoice')}</Label>
            <FileUpload
              value={watch('target_audience_voice_url') ?? ''}
              onChange={(url) => setValue('target_audience_voice_url', url)}
              accept="audio/*"
              folder="target-audience"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{t('projects.audienceFile')}</Label>
            <FileUpload
              value={watch('target_audience_file_url') ?? ''}
              onChange={(url) => setValue('target_audience_file_url', url)}
              accept="application/pdf"
              folder="target-audience"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="billing_day">{t('projects.billingDay')}</Label>
            <Input id="billing_day" type="number" min={1} max={31} {...register('billing_day')} />
          </div>

          {isCeo && (
            <div className="flex flex-col gap-1.5 rounded-lg border border-border p-3">
              <Label>{t('projects.contract')}</Label>
              <FileUpload
                value={watch('contract_url') ?? ''}
                onChange={(url) => setValue('contract_url', url)}
                folder="contracts"
              />
            </div>
          )}

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
