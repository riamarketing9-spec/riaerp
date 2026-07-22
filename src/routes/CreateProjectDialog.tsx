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
  DialogFooter,
} from '@/components/ui/dialog'
import { Combobox } from '@/components/ui/combobox'
import { Plus } from 'lucide-react'
import { pickLabel } from '@/lib/localizedLabel'
import { FileUpload } from '@/components/FileUpload'
import { Checkbox } from '@/components/ui/checkbox'

const schema = z.object({
  name: z.string().min(1, 'Обязательное поле'),
  project_type_id: z.string().min(1, 'Обязательное поле'),
  status_id: z.string().min(1, 'Обязательное поле'),
  pm_profile_id: z.string().min(1, 'Обязательное поле'),
  client_id: z.string().optional(),
  goal: z.string().optional(),
  deliverables_text: z.string().optional(),
  target_audience: z.string().optional(),
  target_audience_voice_url: z.string().optional(),
  target_audience_file_url: z.string().optional(),
  logo_url: z.string().optional(),
  billing_day: z.string().optional(),
  contract_url: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

export function ProjectDialog({
  open,
  onOpenChange,
  projectId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string | null
}) {
  const { t, i18n } = useTranslation()
  const { isCeo } = useAuth()
  const isEdit = !!projectId
  const [assistantPmIds, setAssistantPmIds] = useState<Set<string>>(new Set())
  const queryClient = useQueryClient()

  function toggleAssistantPm(id: string, checked: boolean) {
    setAssistantPmIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

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

  const { data: existing } = useQuery({
    queryKey: ['project-detail', projectId],
    enabled: isEdit && open,
    queryFn: async () => {
      const { data, error } = await supabase.from('projects').select('*').eq('id', projectId!).single()
      if (error) throw error
      return data
    },
  })

  const { data: existingAssistants } = useQuery({
    queryKey: ['project_members-assistants', projectId],
    enabled: isEdit && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_members')
        .select('profile_id')
        .eq('project_id', projectId!)
        .eq('role_on_project', 'assistant_pm')
      if (error) throw error
      return data.map((r) => r.profile_id)
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

  const watchedClientId = watch('client_id')

  const { data: existingContract } = useQuery({
    queryKey: ['contract-for-client', watchedClientId],
    enabled: isCeo && !!watchedClientId && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contracts')
        .select('id, storage_path')
        .eq('party_client_id', watchedClientId!)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data
    },
  })

  useEffect(() => {
    if (open && !isEdit) {
      reset({})
      setAssistantPmIds(new Set())
    }
  }, [open, isEdit, reset])

  useEffect(() => {
    if (existing) {
      reset({
        name: existing.name,
        project_type_id: existing.project_type_id,
        status_id: existing.status_id,
        pm_profile_id: existing.pm_profile_id,
        client_id: existing.client_id ?? '',
        goal: existing.goal ?? '',
        deliverables_text: existing.deliverables_text ?? '',
        target_audience: existing.target_audience ?? '',
        target_audience_voice_url: existing.target_audience_voice_url ?? '',
        target_audience_file_url: existing.target_audience_file_url ?? '',
        logo_url: existing.logo_url ?? '',
        billing_day: existing.billing_day ? String(existing.billing_day) : '',
      })
    }
  }, [existing, reset])

  useEffect(() => {
    if (existingAssistants) {
      setAssistantPmIds(new Set(existingAssistants))
    }
  }, [existingAssistants])

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const payload = {
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
        logo_url: values.logo_url || null,
        billing_day: values.billing_day ? Number(values.billing_day) : null,
      }

      let currentProjectId = projectId
      if (isEdit) {
        const { error } = await supabase.from('projects').update(payload).eq('id', projectId!)
        if (error) throw error
      } else {
        const { data: project, error } = await supabase.from('projects').insert(payload).select('id').single()
        if (error) throw error
        currentProjectId = project.id
      }

      await supabase.from('project_members').delete().eq('project_id', currentProjectId!).eq('role_on_project', 'assistant_pm')
      if (assistantPmIds.size > 0) {
        await supabase.from('project_members').insert(
          [...assistantPmIds].map((profile_id) => ({
            project_id: currentProjectId!,
            profile_id,
            role_on_project: 'assistant_pm',
          }))
        )
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
      toast.success(isEdit ? t('team.saved') : t('projects.newProject'))
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['project-detail', projectId] })
      queryClient.invalidateQueries({ queryKey: ['project_members-assistants', projectId] })
      reset()
      setAssistantPmIds(new Set())
      onOpenChange(false)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? existing?.name ?? t('projects.title') : t('projects.newProject')}</DialogTitle>
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
            <Label>{t('projects.logo')}</Label>
            <div className="flex items-center gap-3">
              {watch('logo_url') && (
                <img src={watch('logo_url')} alt="" className="size-10 shrink-0 rounded-full object-cover" />
              )}
              <FileUpload
                value={watch('logo_url') ?? ''}
                onChange={(url) => setValue('logo_url', url)}
                accept="image/*"
                folder="project-logos"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>{t('projects.client')}</Label>
            <Combobox
              options={(clients ?? []).map((c) => ({ value: c.id, label: c.name }))}
              value={watch('client_id') ?? ''}
              onChange={(v) => setValue('client_id', v)}
            />
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

          <div className="flex flex-col gap-1.5">
            <Label>{t('projects.pm')}</Label>
            <Combobox
              options={(managers ?? []).map((m) => ({ value: m.id, label: m.full_name }))}
              value={watch('pm_profile_id') ?? ''}
              onChange={(v) => setValue('pm_profile_id', v)}
            />
            {errors.pm_profile_id && (
              <p className="text-xs text-destructive">{errors.pm_profile_id.message}</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>{t('projects.assistantPm')}</Label>
            <div className="flex flex-wrap gap-3 rounded-lg border border-border p-3">
              {managers?.map((m) => (
                <div key={m.id} className="flex items-center gap-1.5">
                  <Checkbox
                    id={`assistant-pm-${m.id}`}
                    checked={assistantPmIds.has(m.id)}
                    onCheckedChange={(checked) => toggleAssistantPm(m.id, checked === true)}
                  />
                  <Label htmlFor={`assistant-pm-${m.id}`} className="font-normal">
                    {m.full_name}
                  </Label>
                </div>
              ))}
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
              {existingContract && (
                <a
                  href={existingContract.storage_path}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-brand-600 underline dark:text-brand-400"
                >
                  {t('projects.contractCurrent')}
                </a>
              )}
              <FileUpload
                value={watch('contract_url') ?? ''}
                onChange={(url) => setValue('contract_url', url)}
                folder="contracts"
              />
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

export function CreateProjectDialog() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus />
        {t('projects.newProject')}
      </Button>
      <ProjectDialog open={open} onOpenChange={setOpen} projectId={null} />
    </>
  )
}
