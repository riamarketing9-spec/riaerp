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
import { Combobox } from '@/components/ui/combobox'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Plus } from 'lucide-react'
import { FileUpload } from '@/components/FileUpload'

type DocKind = 'document' | 'contract'

const schema = z.object({
  title: z.string().min(1, 'Обязательное поле'),
  storage_path: z.string().min(1, 'Обязательное поле'),
  note: z.string().optional(),
  profile_id: z.string().min(1, 'Обязательное поле'),
})

type FormValues = z.infer<typeof schema>

export function DocumentDialog({
  open,
  onOpenChange,
  documentId,
  kind,
  defaultProfileId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  documentId: string | null
  kind: DocKind
  defaultProfileId?: string | null
}) {
  const { t } = useTranslation()
  const isEdit = !!documentId
  const queryClient = useQueryClient()

  const { data: profiles } = useQuery({
    queryKey: ['profiles-lookup-active'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('id, full_name').is('deleted_at', null)
      if (error) throw error
      return data
    },
  })

  const { data: existing } = useQuery({
    queryKey: ['document-detail', documentId],
    enabled: isEdit && open,
    queryFn: async () => {
      const { data, error } = await supabase.from('documents').select('*').eq('id', documentId!).single()
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

  useEffect(() => {
    if (open && !isEdit) {
      reset({ title: '', storage_path: '', note: '', profile_id: defaultProfileId ?? '' })
      setDraftId(null)
    }
  }, [open, isEdit, defaultProfileId, reset])

  useEffect(() => {
    if (existing) {
      reset({
        title: existing.title,
        storage_path: existing.storage_path,
        note: existing.note ?? '',
        profile_id: existing.profile_id ?? '',
      })
    }
  }, [existing, reset])

  const [draftId, setDraftId] = useState<string | null>(null)
  const effectiveId = documentId ?? draftId
  const effectiveKind = existing?.kind ?? kind

  async function performSave(values: FormValues) {
    const payload = {
      title: values.title,
      storage_path: values.storage_path,
      note: values.note || null,
      profile_id: values.profile_id,
    }
    if (effectiveId) {
      const { error } = await supabase.from('documents').update(payload).eq('id', effectiveId)
      if (error) throw error
    } else {
      const { data, error } = await supabase
        .from('documents')
        .insert({ ...payload, kind, is_org_wide: false })
        .select('id')
        .single()
      if (error) throw error
      setDraftId(data.id)
    }
    queryClient.invalidateQueries({ queryKey: ['documents'] })
  }

  const mutation = useMutation({
    mutationFn: performSave,
    onSuccess: () => {
      toast.success(isEdit ? t('common.save') : t(effectiveKind === 'contract' ? 'docs.newContract' : 'docs.newDocument'))
      queryClient.invalidateQueries({ queryKey: ['document-detail', documentId] })
      onOpenChange(false)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const watched = watch()
  const canAutosave = !!(watched.title && watched.storage_path && watched.profile_id)
  const autosaveStatus = useAutosave(
    watched,
    async (values) => {
      if (!canAutosave) return
      await performSave(values)
    },
    { enabled: open, resetKey: documentId }
  )

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('documents').delete().eq('id', documentId!)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success(t('common.delete'))
      queryClient.invalidateQueries({ queryKey: ['documents'] })
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
          <DialogTitle>
            {isEdit ? t('common.edit') : t(kind === 'contract' ? 'docs.newContract' : 'docs.newDocument')}
          </DialogTitle>
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
            <Label htmlFor="title">{t('docs.docTitle')}</Label>
            <Input id="title" {...register('title')} />
            {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>{t('docs.employee')}</Label>
            <Combobox
              options={(profiles ?? []).map((p) => ({ value: p.id, label: p.full_name }))}
              value={watch('profile_id') ?? ''}
              onChange={(v) => setValue('profile_id', v)}
            />
            {errors.profile_id && <p className="text-xs text-destructive">{errors.profile_id.message}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="storage_path">{t('docs.storagePath')}</Label>
            <FileUpload
              value={watch('storage_path') ?? ''}
              onChange={(url) => setValue('storage_path', url)}
              folder="documents"
            />
            {errors.storage_path && (
              <p className="text-xs text-destructive">{errors.storage_path.message}</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="note">{t('docs.note')}</Label>
            <Textarea id="note" rows={3} {...register('note')} />
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

export function CreateDocumentDialog({ kind, defaultProfileId }: { kind: DocKind; defaultProfileId?: string | null }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus />
        {t(kind === 'contract' ? 'docs.newContract' : 'docs.newDocument')}
      </Button>
      <DocumentDialog open={open} onOpenChange={setOpen} documentId={null} kind={kind} defaultProfileId={defaultProfileId} />
    </>
  )
}
