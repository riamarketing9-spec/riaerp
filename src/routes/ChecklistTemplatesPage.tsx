import { useEffect, useState } from 'react'
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
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Combobox } from '@/components/ui/combobox'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Plus, Pencil, Trash2, ChevronDown, ChevronUp, ChevronRight } from 'lucide-react'
import { pickLabel } from '@/lib/localizedLabel'

const CADENCE_ORDER = ['daily', 'weekly', 'monthly']

const templateSchema = z.object({
  title: z.string().min(1, 'Обязательное поле'),
  cadence_id: z.string().min(1, 'Обязательное поле'),
  applies_to_all: z.boolean(),
  role_id: z.string().optional(),
  department_id: z.string().optional(),
})

type TemplateFormValues = z.infer<typeof templateSchema>

function TemplateDialog({
  open,
  onOpenChange,
  templateId,
  defaultCadenceId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  templateId: string | null
  defaultCadenceId: string | null
}) {
  const { t, i18n } = useTranslation()
  const isEdit = !!templateId
  const queryClient = useQueryClient()

  const { data: cadences } = useQuery({
    queryKey: ['checklist_cadences'],
    queryFn: async () => {
      const { data, error } = await supabase.from('checklist_cadences').select('id, slug')
      if (error) throw error
      return data
    },
  })

  const { data: roles } = useQuery({
    queryKey: ['roles-lookup'],
    queryFn: async () => {
      const { data, error } = await supabase.from('roles').select('id, slug, label_ru, label_uz')
      if (error) throw error
      return data
    },
  })

  const { data: departments } = useQuery({
    queryKey: ['departments'],
    queryFn: async () => {
      const { data, error } = await supabase.from('departments').select('id, slug, label_ru, label_uz')
      if (error) throw error
      return data
    },
  })

  const { data: existing } = useQuery({
    queryKey: ['checklist-template-detail', templateId],
    enabled: isEdit && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('checklist_templates')
        .select('*')
        .eq('id', templateId!)
        .single()
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
  } = useForm<TemplateFormValues>({
    resolver: zodResolver(templateSchema),
    defaultValues: { applies_to_all: false },
  })

  useEffect(() => {
    if (open && !isEdit) {
      reset({
        title: '',
        cadence_id: defaultCadenceId ?? '',
        applies_to_all: false,
        role_id: '',
        department_id: '',
      })
    }
  }, [open, isEdit, defaultCadenceId, reset])

  useEffect(() => {
    if (existing) {
      reset({
        title: existing.title,
        cadence_id: existing.cadence_id,
        applies_to_all: existing.applies_to_all,
        role_id: existing.role_id ?? '',
        department_id: existing.department_id ?? '',
      })
    }
  }, [existing, reset])

  const mutation = useMutation({
    mutationFn: async (values: TemplateFormValues) => {
      const payload = {
        title: values.title,
        cadence_id: values.cadence_id,
        applies_to_all: values.applies_to_all,
        role_id: values.role_id || null,
        department_id: values.department_id || null,
      }
      if (isEdit) {
        const { error } = await supabase.from('checklist_templates').update(payload).eq('id', templateId!)
        if (error) throw error
      } else {
        const { error } = await supabase.from('checklist_templates').insert(payload)
        if (error) throw error
      }
    },
    onSuccess: () => {
      toast.success(isEdit ? t('common.save') : t('checklistAdmin.newTemplate'))
      queryClient.invalidateQueries({ queryKey: ['checklist_templates-all'] })
      queryClient.invalidateQueries({ queryKey: ['checklist-template-detail', templateId] })
      reset()
      onOpenChange(false)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('checklist_templates').delete().eq('id', templateId!)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success(t('common.delete'))
      queryClient.invalidateQueries({ queryKey: ['checklist_templates-all'] })
      onOpenChange(false)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  function handleDelete() {
    if (window.confirm(t('common.delete') + '?')) deleteMutation.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? t('common.edit') : t('checklistAdmin.newTemplate')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit((values) => mutation.mutate(values))} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="title">{t('checklistAdmin.templateTitle')}</Label>
            <Input id="title" {...register('title')} />
            {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>{t('checklistAdmin.cadence')}</Label>
            <Combobox
              options={(cadences ?? []).map((c) => ({
                value: c.id,
                label: t(`checklistAdmin.cadence_${c.slug}`, c.slug),
              }))}
              value={watch('cadence_id') ?? ''}
              onChange={(v) => setValue('cadence_id', v)}
            />
            {errors.cadence_id && <p className="text-xs text-destructive">{errors.cadence_id.message}</p>}
          </div>

          <div className="flex items-center gap-1.5">
            <Checkbox
              id="applies_to_all"
              checked={watch('applies_to_all')}
              onCheckedChange={(checked) => setValue('applies_to_all', checked === true)}
            />
            <Label htmlFor="applies_to_all" className="font-normal">
              {t('checklistAdmin.appliesToAll')}
            </Label>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>{t('checklistAdmin.role')}</Label>
            <Combobox
              options={(roles ?? []).map((r) => ({ value: r.id, label: pickLabel(r, i18n.language) ?? r.slug }))}
              value={watch('role_id') ?? ''}
              onChange={(v) => setValue('role_id', v)}
              placeholder={t('checklistAdmin.noRole')}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>{t('checklistAdmin.department')}</Label>
            <Combobox
              options={(departments ?? []).map((d) => ({ value: d.id, label: pickLabel(d, i18n.language) ?? d.slug }))}
              value={watch('department_id') ?? ''}
              onChange={(v) => setValue('department_id', v)}
              placeholder={t('checklistAdmin.noDepartment')}
            />
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
              {isEdit ? t('common.save') : t('common.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

type TemplateItem = {
  id: string
  template_id: string
  label_ru: string
  label_uz: string
  sort_order: number
  requires_note: boolean
}

function ItemRow({
  item,
  templateId,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
}: {
  item: TemplateItem
  templateId: string
  isFirst: boolean
  isLast: boolean
  onMoveUp: () => void
  onMoveDown: () => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [labelRu, setLabelRu] = useState(item.label_ru)
  const [labelUz, setLabelUz] = useState(item.label_uz)
  const [requiresNote, setRequiresNote] = useState(item.requires_note)
  const itemsKey = ['checklist_template_items', templateId]

  const updateMutation = useMutation({
    mutationFn: async (payload: Partial<Pick<TemplateItem, 'label_ru' | 'label_uz' | 'requires_note'>>) => {
      const { error } = await supabase.from('checklist_template_items').update(payload).eq('id', item.id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: itemsKey })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('checklist_template_items').delete().eq('id', item.id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success(t('common.delete'))
      queryClient.invalidateQueries({ queryKey: itemsKey })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  function handleSave() {
    updateMutation.mutate(
      { label_ru: labelRu.trim(), label_uz: labelUz.trim() || labelRu.trim(), requires_note: requiresNote },
      { onSuccess: () => setEditing(false) }
    )
  }

  function handleDelete() {
    if (window.confirm(t('common.delete') + '?')) deleteMutation.mutate()
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-2 rounded-md border border-border p-2.5">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Input value={labelRu} onChange={(e) => setLabelRu(e.target.value)} placeholder={t('checklistAdmin.labelRu')} />
          <Input value={labelUz} onChange={(e) => setLabelUz(e.target.value)} placeholder={t('checklistAdmin.labelUz')} />
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Checkbox
              id={`req-${item.id}`}
              checked={requiresNote}
              onCheckedChange={(checked) => setRequiresNote(checked === true)}
            />
            <Label htmlFor={`req-${item.id}`} className="font-normal text-xs">
              {t('checklistAdmin.requiresNote')}
            </Label>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
              {t('common.cancel')}
            </Button>
            <Button size="sm" disabled={updateMutation.isPending} onClick={handleSave}>
              {t('common.save')}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2.5 py-1.5">
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm">{item.label_ru}</span>
        <span className="truncate text-xs text-muted-foreground">{item.label_uz}</span>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {item.requires_note && (
          <Badge variant="outline" className="text-[10px]">
            {t('checklistAdmin.requiresNote')}
          </Badge>
        )}
        <button
          disabled={isFirst}
          onClick={onMoveUp}
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
        >
          <ChevronUp className="size-3.5" />
        </button>
        <button
          disabled={isLast}
          onClick={onMoveDown}
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
        >
          <ChevronDown className="size-3.5" />
        </button>
        <button
          onClick={() => setEditing(true)}
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Pencil className="size-3.5" />
        </button>
        <button
          onClick={handleDelete}
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
    </div>
  )
}

function TemplateItemsPanel({ templateId }: { templateId: string }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const itemsKey = ['checklist_template_items', templateId]
  const [newLabelRu, setNewLabelRu] = useState('')
  const [newLabelUz, setNewLabelUz] = useState('')
  const [newRequiresNote, setNewRequiresNote] = useState(false)

  const { data: items, isLoading } = useQuery({
    queryKey: itemsKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('checklist_template_items')
        .select('id, template_id, label_ru, label_uz, sort_order, requires_note')
        .eq('template_id', templateId)
        .order('sort_order')
      if (error) throw error
      return data
    },
  })

  const addMutation = useMutation({
    mutationFn: async () => {
      const maxOrder = (items ?? []).reduce((max, i) => Math.max(max, i.sort_order), 0)
      const { error } = await supabase.from('checklist_template_items').insert({
        template_id: templateId,
        label_ru: newLabelRu.trim(),
        label_uz: newLabelUz.trim() || newLabelRu.trim(),
        requires_note: newRequiresNote,
        sort_order: maxOrder + 1,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: itemsKey })
      setNewLabelRu('')
      setNewLabelUz('')
      setNewRequiresNote(false)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const swapMutation = useMutation({
    mutationFn: async ({ a, b }: { a: TemplateItem; b: TemplateItem }) => {
      const [err1, err2] = await Promise.all([
        supabase.from('checklist_template_items').update({ sort_order: b.sort_order }).eq('id', a.id),
        supabase.from('checklist_template_items').update({ sort_order: a.sort_order }).eq('id', b.id),
      ]).then((results) => results.map((r) => r.error))
      if (err1) throw err1
      if (err2) throw err2
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: itemsKey })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      {isLoading && <p className="text-xs text-muted-foreground">{t('common.loading')}...</p>}
      {!isLoading && (items?.length ?? 0) === 0 && (
        <p className="text-xs text-muted-foreground">{t('checklistAdmin.emptyItems')}</p>
      )}
      {items?.map((item, idx) => (
        <ItemRow
          key={item.id}
          item={item}
          templateId={templateId}
          isFirst={idx === 0}
          isLast={idx === (items?.length ?? 0) - 1}
          onMoveUp={() => {
            const prev = items?.[idx - 1]
            if (prev) swapMutation.mutate({ a: item, b: prev })
          }}
          onMoveDown={() => {
            const next = items?.[idx + 1]
            if (next) swapMutation.mutate({ a: item, b: next })
          }}
        />
      ))}

      <div className="flex flex-col gap-2 rounded-md border border-dashed border-border p-2.5">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Input
            value={newLabelRu}
            onChange={(e) => setNewLabelRu(e.target.value)}
            placeholder={t('checklistAdmin.labelRu')}
            className="h-8"
          />
          <Input
            value={newLabelUz}
            onChange={(e) => setNewLabelUz(e.target.value)}
            placeholder={t('checklistAdmin.labelUz')}
            className="h-8"
          />
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Checkbox
              id={`new-req-${templateId}`}
              checked={newRequiresNote}
              onCheckedChange={(checked) => setNewRequiresNote(checked === true)}
            />
            <Label htmlFor={`new-req-${templateId}`} className="font-normal text-xs">
              {t('checklistAdmin.requiresNote')}
            </Label>
          </div>
          <Button
            size="sm"
            disabled={!newLabelRu.trim() || addMutation.isPending}
            onClick={() => addMutation.mutate()}
          >
            <Plus className="size-3.5" />
            {t('checklistAdmin.addItem')}
          </Button>
        </div>
      </div>
    </div>
  )
}

type Template = {
  id: string
  cadence_id: string
  role_id: string | null
  department_id: string | null
  title: string
  applies_to_all: boolean
}

export function ChecklistTemplatesPage() {
  const { t, i18n } = useTranslation()
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [dialogState, setDialogState] = useState<{ open: boolean; templateId: string | null; cadenceId: string | null }>({
    open: false,
    templateId: null,
    cadenceId: null,
  })

  const { data: cadences } = useQuery({
    queryKey: ['checklist_cadences'],
    queryFn: async () => {
      const { data, error } = await supabase.from('checklist_cadences').select('id, slug')
      if (error) throw error
      return data
    },
  })

  const { data: templates, isLoading } = useQuery({
    queryKey: ['checklist_templates-all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('checklist_templates')
        .select('id, cadence_id, role_id, department_id, title, applies_to_all')
      if (error) throw error
      return data as Template[]
    },
  })

  const { data: roles } = useQuery({
    queryKey: ['roles-lookup'],
    queryFn: async () => {
      const { data, error } = await supabase.from('roles').select('id, slug, label_ru, label_uz')
      if (error) throw error
      return data
    },
  })

  const { data: departments } = useQuery({
    queryKey: ['departments'],
    queryFn: async () => {
      const { data, error } = await supabase.from('departments').select('id, slug, label_ru, label_uz')
      if (error) throw error
      return data
    },
  })

  function toggleExpanded(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const sortedCadences = [...(cadences ?? [])].sort(
    (a, b) => CADENCE_ORDER.indexOf(a.slug) - CADENCE_ORDER.indexOf(b.slug)
  )

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{t('checklistAdmin.title')}</h1>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">{t('common.loading')}...</p>}

      {sortedCadences.map((cadence) => {
        const cadenceTemplates = (templates ?? []).filter((tpl) => tpl.cadence_id === cadence.id)
        return (
          <div key={cadence.id} className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-muted-foreground">
                {t(`checklistAdmin.cadence_${cadence.slug}`, cadence.slug)}
              </h2>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setDialogState({ open: true, templateId: null, cadenceId: cadence.id })}
              >
                <Plus className="size-3.5" />
                {t('checklistAdmin.newTemplate')}
              </Button>
            </div>

            {cadenceTemplates.length === 0 && (
              <p className="text-xs text-muted-foreground">{t('checklistAdmin.empty')}</p>
            )}

            {cadenceTemplates.map((tpl) => {
              const isExpanded = expandedIds.has(tpl.id)
              const roleLabel = tpl.role_id ? pickLabel(roles?.find((r) => r.id === tpl.role_id), i18n.language) : undefined
              const deptLabel = tpl.department_id
                ? pickLabel(departments?.find((d) => d.id === tpl.department_id), i18n.language)
                : undefined
              return (
                <Card key={tpl.id}>
                  <CardHeader
                    className="cursor-pointer"
                    onClick={() => toggleExpanded(tpl.id)}
                  >
                    <CardTitle className="flex items-center justify-between gap-2 text-base font-medium">
                      <span className="flex items-center gap-2">
                        {isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                        {tpl.title}
                      </span>
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setDialogState({ open: true, templateId: tpl.id, cadenceId: null })}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                      </div>
                    </CardTitle>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {tpl.applies_to_all && (
                        <Badge variant="secondary" className="text-[10px]">
                          {t('checklistAdmin.appliesToAll')}
                        </Badge>
                      )}
                      {roleLabel && (
                        <Badge variant="outline" className="text-[10px]">
                          {roleLabel}
                        </Badge>
                      )}
                      {deptLabel && (
                        <Badge variant="outline" className="text-[10px]">
                          {deptLabel}
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  {isExpanded && (
                    <CardContent>
                      <TemplateItemsPanel templateId={tpl.id} />
                    </CardContent>
                  )}
                </Card>
              )
            })}
          </div>
        )
      })}

      <TemplateDialog
        open={dialogState.open}
        onOpenChange={(open) => setDialogState((prev) => ({ ...prev, open }))}
        templateId={dialogState.templateId}
        defaultCadenceId={dialogState.cadenceId}
      />
    </div>
  )
}
