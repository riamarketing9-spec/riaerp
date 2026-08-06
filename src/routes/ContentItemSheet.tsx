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
import { ExternalLink, X } from 'lucide-react'

const schema = z.object({
  project_id: z.string().min(1, 'Обязательное поле'),
  topic: z.string().min(1, 'Обязательное поле'),
  format_id: z.string().min(1, 'Обязательное поле'),
  status_id: z.string().min(1, 'Обязательное поле'),
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

// Precise "who did what": each entry is one person + the specific work
// types (иш тури) attributed to them on this item, so a per-employee
// report can later say exactly what each person did instead of just "N
// people worked on M things" with no link between the two.
type Assignment = { profileId: string; deliverableTypeIds: string[] }

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

  const { data: existingAssignmentRows } = useQuery({
    queryKey: ['content_plan_person_deliverable_types', itemId],
    enabled: !!itemId && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('content_plan_person_deliverable_types')
        .select('profile_id, deliverable_type_id')
        .eq('content_plan_item_id', itemId!)
      if (error) throw error
      return data
    },
  })

  // Legacy fallback for items never touched under the precise per-person
  // model: pair every old responsible person with every old work type
  // (best effort, can't know the real historical pairing).
  const { data: existingLegacyResponsibleIds } = useQuery({
    queryKey: ['content_plan_responsibles', itemId],
    enabled: !!itemId && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('content_plan_responsibles')
        .select('profile_id')
        .eq('content_plan_item_id', itemId!)
      if (error) throw error
      return data.map((r) => r.profile_id)
    },
  })
  const { data: existingLegacyDeliverableTypeIds } = useQuery({
    queryKey: ['content_plan_deliverable_types', itemId],
    enabled: !!itemId && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('content_plan_deliverable_types')
        .select('deliverable_type_id')
        .eq('content_plan_item_id', itemId!)
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
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  const selectedPlatforms = watch('_platforms' as never) as string[] | undefined
  const assignments = (watch('_assignments' as never) as unknown as Assignment[] | undefined) ?? []
  const [assigneeRoleId, setAssigneeRoleId] = useState('')
  const [pendingResponsibleId, setPendingResponsibleId] = useState('')

  useEffect(() => {
    if (open && !isEdit) {
      reset({ project_id: defaultProjectId ?? '', publish_date: defaultPublishDate ?? '' })
      setValue('_platforms' as never, [] as never)
      setValue('_assignments' as never, [] as never)
      setAssigneeRoleId('')
      setPendingResponsibleId('')
      setDraftId(null)
    }
  }, [open, isEdit, defaultProjectId, defaultPublishDate, reset, setValue])

  useEffect(() => {
    if (existing) {
      reset({
        project_id: existing.project_id,
        topic: existing.topic,
        format_id: existing.format_id ?? '',
        status_id: existing.status_id,
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
    if (!existingAssignmentRows) return
    if (existingAssignmentRows.length > 0) {
      const map = new Map<string, string[]>()
      for (const row of existingAssignmentRows) {
        const list = map.get(row.profile_id) ?? []
        list.push(row.deliverable_type_id)
        map.set(row.profile_id, list)
      }
      setValue(
        '_assignments' as never,
        [...map.entries()].map(([profileId, deliverableTypeIds]) => ({ profileId, deliverableTypeIds })) as never
      )
      return
    }
    // Nothing in the precise table yet -- old item, fall back to pairing
    // every legacy responsible person with every legacy work type so it
    // doesn't show up empty the first time it's reopened.
    if (!existingLegacyResponsibleIds || !existingLegacyDeliverableTypeIds) return
    const fallbackResponsibles =
      existingLegacyResponsibleIds.length > 0
        ? existingLegacyResponsibleIds
        : [
            existing?.responsible_profile_id,
            existing?.shooter_profile_id,
            existing?.editor_profile_id,
            existing?.smm_profile_id,
          ].filter((id): id is string => !!id)
    if (fallbackResponsibles.length === 0) return
    setValue(
      '_assignments' as never,
      fallbackResponsibles.map((profileId) => ({
        profileId,
        deliverableTypeIds: [...existingLegacyDeliverableTypeIds],
      })) as never
    )
  }, [existingAssignmentRows, existingLegacyResponsibleIds, existingLegacyDeliverableTypeIds, existing, setValue])

  function togglePlatform(id: string, checked: boolean) {
    const current = selectedPlatforms ?? []
    setValue(
      '_platforms' as never,
      (checked ? [...current, id] : current.filter((p) => p !== id)) as never
    )
  }

  function addPerson(profileId: string) {
    if (!profileId || assignments.some((a) => a.profileId === profileId)) return
    setValue('_assignments' as never, [...assignments, { profileId, deliverableTypeIds: [] }] as never)
    setPendingResponsibleId('')
  }

  function removePerson(profileId: string) {
    setValue('_assignments' as never, assignments.filter((a) => a.profileId !== profileId) as never)
  }

  function addTypeToPerson(profileId: string, deliverableTypeId: string) {
    if (!deliverableTypeId) return
    setValue(
      '_assignments' as never,
      assignments.map((a) =>
        a.profileId === profileId && !a.deliverableTypeIds.includes(deliverableTypeId)
          ? { ...a, deliverableTypeIds: [...a.deliverableTypeIds, deliverableTypeId] }
          : a
      ) as never
    )
  }

  function removeTypeFromPerson(profileId: string, deliverableTypeId: string) {
    setValue(
      '_assignments' as never,
      assignments.map((a) =>
        a.profileId === profileId
          ? { ...a, deliverableTypeIds: a.deliverableTypeIds.filter((d) => d !== deliverableTypeId) }
          : a
      ) as never
    )
  }

  // Local id for a record created by autosave before the parent ever passed
  // an itemId down -- the prop stays null until the dialog is reopened, so
  // this is what turns later autosave ticks into updates instead of re-inserts.
  const [draftId, setDraftId] = useState<string | null>(null)
  const effectiveId = itemId ?? draftId

  async function performSave(values: FormValues) {
    // Derived views of the precise per-person assignments, kept in sync in
    // their own junction tables too so existing readers (calendar/table
    // badges, monthly-goal % calc) keep working unchanged -- they only
    // ever needed "which work types/people are on this item", not the
    // pairing between them.
    const responsibleIds = [...new Set(assignments.map((a) => a.profileId))]
    const deliverableTypeIds = [...new Set(assignments.flatMap((a) => a.deliverableTypeIds))]
    const payload = {
      project_id: values.project_id,
      topic: values.topic,
      format_id: values.format_id,
      status_id: values.status_id,
      // Kept in sync as "the first selected work type"/"first selected
      // responsible" for any code that still reads the single legacy
      // columns -- the junction tables are the actual source of truth now.
      deliverable_type_id: deliverableTypeIds[0] ?? null,
      responsible_profile_id: responsibleIds[0] ?? null,
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

    await supabase.from('content_plan_deliverable_types').delete().eq('content_plan_item_id', id)
    if (deliverableTypeIds.length > 0) {
      await supabase.from('content_plan_deliverable_types').insert(
        deliverableTypeIds.map((deliverable_type_id) => ({ content_plan_item_id: id!, deliverable_type_id }))
      )
    }

    await supabase.from('content_plan_responsibles').delete().eq('content_plan_item_id', id)
    if (responsibleIds.length > 0) {
      await supabase.from('content_plan_responsibles').insert(
        responsibleIds.map((profile_id) => ({ content_plan_item_id: id!, profile_id }))
      )
    }

    // The actual source of truth: precise (person, work type) pairs.
    await supabase.from('content_plan_person_deliverable_types').delete().eq('content_plan_item_id', id)
    const assignmentRows = assignments.flatMap((a) =>
      a.deliverableTypeIds.map((deliverable_type_id) => ({
        content_plan_item_id: id!,
        profile_id: a.profileId,
        deliverable_type_id,
      }))
    )
    if (assignmentRows.length > 0) {
      await supabase.from('content_plan_person_deliverable_types').insert(assignmentRows)
    }

    // Not this sheet's own ['content_plan_platforms'/'content_plan_deliverable_types'/
    // 'content_plan_responsibles'/'content_plan_person_deliverable_types', id]
    // here -- refetching while still open re-triggers the effect that
    // populates the checkboxes/rows, reverting whatever the user just
    // toggled before it's saved. Invalidated in mutation.onSuccess instead,
    // once closing.
    queryClient.invalidateQueries({ queryKey: ['content_plan_items'] })
    queryClient.invalidateQueries({ queryKey: ['content_plan_platforms-all'] })
    queryClient.invalidateQueries({ queryKey: ['content_plan_deliverable_types-all'] })
    queryClient.invalidateQueries({ queryKey: ['content_plan_responsibles-all'] })
    queryClient.invalidateQueries({ queryKey: ['content_plan_person_deliverable_types-all'] })
  }

  const mutation = useMutation({
    mutationFn: performSave,
    onSuccess: () => {
      toast.success(isEdit ? 'Сохранено' : 'Добавлено в контент-план')
      queryClient.invalidateQueries({ queryKey: ['content_plan_platforms', itemId] })
      queryClient.invalidateQueries({ queryKey: ['content_plan_deliverable_types', itemId] })
      queryClient.invalidateQueries({ queryKey: ['content_plan_responsibles', itemId] })
      queryClient.invalidateQueries({ queryKey: ['content_plan_person_deliverable_types', itemId] })
      onOpenChange(false)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const watched = watch()
  const canAutosave = !!(watched.project_id && watched.topic && watched.format_id && watched.status_id)
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

          <div className="flex flex-col gap-1.5">
            <Label>{t('contentPlan.responsible')}</Label>
            <p className="text-xs text-muted-foreground">{t('contentPlan.responsibleHint')}</p>

            {assignments.length > 0 && (
              <div className="flex flex-col gap-1.5">
                {assignments.map((a) => (
                  <div
                    key={a.profileId}
                    className="flex flex-wrap items-center gap-1.5 rounded-md border border-border px-2 py-1.5"
                  >
                    <span className="shrink-0 text-xs font-semibold">
                      {allProfiles?.find((p) => p.id === a.profileId)?.full_name ?? '—'}
                    </span>
                    {a.deliverableTypeIds.map((dId) => (
                      <span
                        key={dId}
                        className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium"
                      >
                        {pickLabel(deliverableTypes?.find((d) => d.id === dId), i18n.language)}
                        <button
                          type="button"
                          onClick={() => removeTypeFromPerson(a.profileId, dId)}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <X className="size-2.5" />
                        </button>
                      </span>
                    ))}
                    <Combobox
                      className="h-7 w-36 text-xs"
                      options={(deliverableTypes ?? [])
                        .filter((d) => !a.deliverableTypeIds.includes(d.id))
                        .map((d) => ({ value: d.id, label: pickLabel(d, i18n.language) ?? '' }))}
                      value=""
                      onChange={(v) => addTypeToPerson(a.profileId, v)}
                      placeholder={t('contentPlan.addWorkType')}
                    />
                    <button
                      type="button"
                      onClick={() => removePerson(a.profileId)}
                      className="ml-auto shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Combobox
                options={(rolesForFiltering ?? []).map((r) => ({ value: r.id, label: pickLabel(r, i18n.language) ?? '' }))}
                value={assigneeRoleId}
                onChange={(v) => {
                  setAssigneeRoleId(v)
                  setPendingResponsibleId('')
                }}
                placeholder={t('team.role')}
              />
              <Combobox
                options={profilesByRoleId(assigneeRoleId)
                  .filter((p) => !assignments.some((a) => a.profileId === p.id))
                  .map((p) => ({ value: p.id, label: p.full_name }))}
                value={pendingResponsibleId}
                onChange={(v) => addPerson(v)}
                placeholder={t('contentPlan.addResponsible')}
              />
            </div>
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
