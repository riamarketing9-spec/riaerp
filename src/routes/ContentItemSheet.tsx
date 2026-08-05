import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabaseClient'
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
import { pickLabel } from '@/lib/localizedLabel'
import { normalizeUrl } from '@/lib/utils'
import { ExternalLink } from 'lucide-react'

const schema = z.object({
  project_id: z.string().min(1, 'Обязательное поле'),
  topic: z.string().min(1, 'Обязательное поле'),
  status_id: z.string().min(1, 'Обязательное поле'),
  deliverable_type_id: z.string().optional(),
  responsible_profile_id: z.string().optional(),
  shoot_date: z.string().optional(),
  edit_done_date: z.string().optional(),
  cover_done_date: z.string().optional(),
  publish_date: z.string().optional(),
  script: z.string().optional(),
  tor_text: z.string().optional(),
  rubric_id: z.string().optional(),
  video_goal: z.string().optional(),
  reference_url: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

export function ContentItemSheet({
  open,
  onOpenChange,
  itemId,
  defaultProjectId,
  defaultPublishDate,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  itemId: string | null
  defaultProjectId?: string
  defaultPublishDate?: string
}) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const isEdit = !!itemId

  const { data: projects } = useQuery({
    queryKey: ['projects-lookup'],
    queryFn: async () => {
      const { data, error } = await supabase.from('projects').select('id, name, logo_url').order('name')
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
        .select('id, slug, label_ru, label_uz')
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
  // Unfiltered, for resolving the name of a person already assigned to this
  // item even after they've since been removed from the team -- the picker
  // options themselves (profilesWithRoles below) stay active-only.
  const { data: allProfiles } = useQuery({
    queryKey: ['profiles-lookup-all'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('id, full_name')
      if (error) throw error
      return data
    },
  })
  // Distinct key/shape from 'profiles-lookup' (which several other pages
  // share expecting just id+full_name) -- needs role_id too, to filter each
  // combobox down to people in the matching profession.
  const { data: profilesWithRoles } = useQuery({
    queryKey: ['profiles-lookup-with-role'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, role_id')
        .is('deleted_at', null)
      if (error) throw error
      return data
    },
  })
  const { data: rolesForFiltering } = useQuery({
    queryKey: ['roles-lookup'],
    queryFn: async () => {
      const { data, error } = await supabase.from('roles').select('id, slug, label_ru, label_uz')
      if (error) throw error
      return data
    },
  })
  // Secondary positions ("Qo'shimcha lavozimlar" in the employee editor) --
  // someone whose primary role is e.g. Targetolog but is also checked off
  // as Syomkachi should still show up in the shooter picker.
  const { data: employeeRoles } = useQuery({
    queryKey: ['employee_roles-all'],
    queryFn: async () => {
      const { data, error } = await supabase.from('employee_roles').select('profile_id, role_id')
      if (error) throw error
      return data
    },
  })

  // Generalized version of the old fixed per-role pickers (Syomkachi/
  // Montajchi/SMMchi): pick any role, get everyone in it (primary role or
  // "Qo'shimcha lavozimlar" secondary role), same underlying data as before
  // just keyed by an arbitrary role_id chosen in the UI instead of 3
  // hardcoded slug lists.
  function profilesByRoleId(roleId: string) {
    if (!roleId) return []
    const secondaryProfileIds = new Set(
      (employeeRoles ?? []).filter((er) => er.role_id === roleId).map((er) => er.profile_id)
    )
    return (profilesWithRoles ?? []).filter((p) => p.role_id === roleId || secondaryProfileIds.has(p.id))
  }

  // A previously-assigned person whose role no longer matches the filter
  // (reassigned, or the item predates this filtering) must still show up as
  // the current selection instead of rendering blank.
  function withCurrentSelection(
    list: NonNullable<typeof profilesWithRoles>,
    currentId: string | undefined
  ) {
    if (!currentId || list.some((p) => p.id === currentId)) return list
    const current = allProfiles?.find((p) => p.id === currentId)
    return current ? [{ ...current, role_id: '' }, ...list] : list
  }
  const { data: platforms } = useQuery({
    queryKey: ['platforms'],
    queryFn: async () => {
      const { data, error } = await supabase.from('platforms').select('id, label_ru, label_uz')
      if (error) throw error
      return data
    },
  })
  const { data: rubrics } = useQuery({
    queryKey: ['content_rubrics'],
    queryFn: async () => {
      const { data, error } = await supabase.from('content_rubrics').select('id, label_ru, label_uz').order('sort_order')
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

  const { data: existingFormatIds } = useQuery({
    queryKey: ['content_plan_formats', itemId],
    enabled: !!itemId && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('content_plan_formats')
        .select('format_id')
        .eq('content_plan_item_id', itemId!)
      if (error) throw error
      return data.map((r) => r.format_id)
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
  const selectedFormats = watch('_formats' as never) as string[] | undefined
  const [assigneeRoleId, setAssigneeRoleId] = useState('')

  useEffect(() => {
    if (open && !isEdit) {
      reset({ project_id: defaultProjectId ?? '', publish_date: defaultPublishDate ?? '' })
      setValue('_platforms' as never, [] as never)
      setValue('_formats' as never, [] as never)
      setAssigneeRoleId('')
      setDraftId(null)
    }
  }, [open, isEdit, defaultProjectId, defaultPublishDate, reset, setValue])

  useEffect(() => {
    if (existing) {
      // Old items assigned via the retired shooter/editor/smm fields fall
      // back into the one flexible "responsible" field the first time
      // they're opened/saved under the new UI, instead of appearing
      // unassigned.
      const legacyResponsible =
        existing.responsible_profile_id ||
        existing.shooter_profile_id ||
        existing.editor_profile_id ||
        existing.smm_profile_id ||
        ''
      reset({
        project_id: existing.project_id,
        topic: existing.topic,
        status_id: existing.status_id,
        deliverable_type_id: existing.deliverable_type_id ?? '',
        responsible_profile_id: legacyResponsible,
        shoot_date: existing.shoot_date ?? '',
        edit_done_date: existing.edit_done_date ?? '',
        cover_done_date: existing.cover_done_date ?? '',
        publish_date: existing.publish_date ?? '',
        script: existing.script ?? '',
        tor_text: existing.tor_text ?? '',
        rubric_id: existing.rubric_id ?? '',
        video_goal: existing.video_goal ?? '',
        reference_url: existing.reference_url ?? '',
      })
    }
  }, [existing, reset])

  useEffect(() => {
    if (existingPlatformIds) {
      setValue('_platforms' as never, existingPlatformIds as never)
    }
  }, [existingPlatformIds, setValue])

  useEffect(() => {
    if (existingFormatIds) {
      setValue('_formats' as never, existingFormatIds as never)
    }
  }, [existingFormatIds, setValue])

  // Derive which role the current "Ответственный" belongs to, once, so
  // reopening a card shows the same role+person the CEO picked -- not
  // re-run once the CEO starts actively picking a different role/person.
  useEffect(() => {
    if (!existing || !profilesWithRoles || assigneeRoleId) return
    const respId =
      existing.responsible_profile_id ||
      existing.shooter_profile_id ||
      existing.editor_profile_id ||
      existing.smm_profile_id
    if (!respId) return
    const person = profilesWithRoles.find((p) => p.id === respId)
    if (person) setAssigneeRoleId(person.role_id)
  }, [existing, profilesWithRoles, assigneeRoleId])

  function togglePlatform(id: string, checked: boolean) {
    const current = selectedPlatforms ?? []
    setValue(
      '_platforms' as never,
      (checked ? [...current, id] : current.filter((p) => p !== id)) as never
    )
  }

  function toggleFormat(id: string, checked: boolean) {
    const current = selectedFormats ?? []
    setValue(
      '_formats' as never,
      (checked ? [...current, id] : current.filter((f) => f !== id)) as never
    )
  }

  // Local id for a record created by autosave before the parent ever passed
  // an itemId down -- the prop stays null until the dialog is reopened, so
  // this is what turns later autosave ticks into updates instead of re-inserts.
  const [draftId, setDraftId] = useState<string | null>(null)
  const effectiveId = itemId ?? draftId

  async function performSave(values: FormValues) {
    const formatIds = selectedFormats ?? []
    const payload = {
      project_id: values.project_id,
      topic: values.topic,
      // Kept in sync as "the first selected work type" for any code that
      // still reads the single legacy column -- content_plan_formats is
      // the actual source of truth now.
      format_id: formatIds[0] ?? null,
      status_id: values.status_id,
      deliverable_type_id: values.deliverable_type_id || null,
      responsible_profile_id: values.responsible_profile_id || null,
      shooter_profile_id: null,
      editor_profile_id: null,
      smm_profile_id: null,
      shoot_date: values.shoot_date || null,
      edit_done_date: values.edit_done_date || null,
      cover_done_date: values.cover_done_date || null,
      publish_date: values.publish_date || null,
      script: values.script || null,
      tor_text: values.tor_text || null,
      rubric_id: values.rubric_id || null,
      video_goal: values.video_goal || null,
      reference_url: values.reference_url || null,
    }

    let id = effectiveId
    if (id) {
      const { error } = await supabase.from('content_plan_items').update(payload).eq('id', id)
      if (error) throw error
    } else {
      const { data, error } = await supabase
        .from('content_plan_items')
        .insert(payload)
        .select('id')
        .single()
      if (error) throw error
      id = data.id
      setDraftId(id)
    }

    await supabase.from('content_plan_platforms').delete().eq('content_plan_item_id', id)
    const platformIds = selectedPlatforms ?? []
    if (platformIds.length > 0) {
      await supabase.from('content_plan_platforms').insert(
        platformIds.map((platform_id) => ({ content_plan_item_id: id!, platform_id }))
      )
    }

    await supabase.from('content_plan_formats').delete().eq('content_plan_item_id', id)
    if (formatIds.length > 0) {
      await supabase.from('content_plan_formats').insert(
        formatIds.map((format_id) => ({ content_plan_item_id: id!, format_id }))
      )
    }

    // Not this sheet's own ['content_plan_platforms'/'content_plan_formats', id]
    // here -- refetching while still open re-triggers the effect that
    // populates the checkboxes, reverting whatever the user just toggled
    // before it's saved. Invalidated in mutation.onSuccess instead, once closing.
    queryClient.invalidateQueries({ queryKey: ['content_plan_items'] })
    queryClient.invalidateQueries({ queryKey: ['content_plan_platforms-all'] })
    queryClient.invalidateQueries({ queryKey: ['content_plan_formats-all'] })
  }

  const mutation = useMutation({
    mutationFn: performSave,
    onSuccess: () => {
      toast.success(isEdit ? 'Сохранено' : 'Добавлено в контент-план')
      queryClient.invalidateQueries({ queryKey: ['content_plan_platforms', itemId] })
      queryClient.invalidateQueries({ queryKey: ['content_plan_formats', itemId] })
      onOpenChange(false)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const watched = watch()
  const canAutosave = !!(
    watched.project_id &&
    watched.topic &&
    watched.status_id &&
    (selectedFormats ?? []).length > 0
  )
  const autosaveStatus = useAutosave(
    watched,
    async (values) => {
      if (!canAutosave) return
      await performSave(values)
    },
    { enabled: open, resetKey: itemId ?? existing?.updated_at ?? null }
  )

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('content_plan_items').delete().eq('id', itemId!)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success(t('common.delete'))
      queryClient.invalidateQueries({ queryKey: ['content_plan_items'] })
      onOpenChange(false)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  function handleDelete() {
    if (window.confirm(t('common.delete') + '?')) deleteMutation.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? t('contentPlan.details') : t('contentPlan.newItem')}</DialogTitle>
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
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="topic">{t('contentPlan.topic')}</Label>
            <Input id="topic" {...register('topic')} />
            {errors.topic && <p className="text-xs text-destructive">{errors.topic.message}</p>}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label>{t('contentPlan.rubric')}</Label>
              <Combobox
                options={(rubrics ?? []).map((r) => ({ value: r.id, label: pickLabel(r, i18n.language) ?? '' }))}
                value={watch('rubric_id') ?? ''}
                onChange={(v) => setValue('rubric_id', v)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="video_goal">{t('contentPlan.videoGoal')}</Label>
              <Input id="video_goal" {...register('video_goal')} />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reference_url">{t('contentPlan.referenceUrl')}</Label>
            <div className="flex items-center gap-2">
              <Input id="reference_url" placeholder="https://..." {...register('reference_url')} />
              {watch('reference_url') && (
                <a
                  href={normalizeUrl(watch('reference_url')!)}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                >
                  <ExternalLink className="size-4" />
                </a>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>{t('contentPlan.project')}</Label>
            <Combobox
              options={(projects ?? []).map((p) => ({ value: p.id, label: p.name }))}
              value={watch('project_id') ?? ''}
              onChange={(v) => setValue('project_id', v)}
            />
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

          <div className="flex flex-col gap-1.5">
            <Label>{t('contentPlan.format')}</Label>
            <p className="text-xs text-muted-foreground">{t('contentPlan.formatHint')}</p>
            <div className="flex flex-wrap gap-3 rounded-lg border border-border p-3">
              {formats?.map((f) => (
                <div key={f.id} className="flex items-center gap-1.5">
                  <Checkbox
                    id={`format-${f.id}`}
                    checked={(selectedFormats ?? []).includes(f.id)}
                    onCheckedChange={(checked) => toggleFormat(f.id, checked === true)}
                  />
                  <Label htmlFor={`format-${f.id}`} className="font-normal">
                    {pickLabel(f, i18n.language)}
                  </Label>
                </div>
              ))}
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

          <div className="flex flex-col gap-1.5">
            <Label>{t('contentPlan.responsible')}</Label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Combobox
                options={(rolesForFiltering ?? []).map((r) => ({ value: r.id, label: pickLabel(r, i18n.language) ?? '' }))}
                value={assigneeRoleId}
                onChange={(v) => {
                  setAssigneeRoleId(v)
                  setValue('responsible_profile_id', '')
                }}
                placeholder={t('team.role')}
              />
              <Combobox
                options={withCurrentSelection(profilesByRoleId(assigneeRoleId), watch('responsible_profile_id')).map(
                  (p) => ({ value: p.id, label: p.full_name })
                )}
                value={watch('responsible_profile_id') ?? ''}
                onChange={(v) => setValue('responsible_profile_id', v)}
              />
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
              <Label htmlFor="edit_done_date">{t('contentPlan.editDoneDate')}</Label>
              <Input id="edit_done_date" type="date" {...register('edit_done_date')} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cover_done_date">{t('contentPlan.coverDoneDate')}</Label>
              <Input id="cover_done_date" type="date" {...register('cover_done_date')} />
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

          <DialogFooter className={isEdit ? 'sm:justify-between' : undefined}>
            {isEdit && (
              <Button
                type="button"
                variant="destructive"
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
              >
                {t('common.delete')}
              </Button>
            )}
            <Button type="submit" disabled={isSubmitting || mutation.isPending}>
              {effectiveId ? t('common.done') : t('common.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
