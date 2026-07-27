import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/auth/AuthProvider'
import { useAutosave } from '@/hooks/useAutosave'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
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
import { Plus } from 'lucide-react'
import { pickLabel } from '@/lib/localizedLabel'
import { FileUpload } from '@/components/FileUpload'

const schema = z.object({
  title: z.string().min(1, 'Обязательное поле'),
  storage_path: z.string().min(1, 'Обязательное поле'),
  category_id: z.string().optional(),
  is_org_wide: z.boolean(),
})

type FormValues = z.infer<typeof schema>

export function DocumentDialog({
  open,
  onOpenChange,
  documentId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  documentId: string | null
}) {
  const { t, i18n } = useTranslation()
  const { profile } = useAuth()
  const isEdit = !!documentId
  const queryClient = useQueryClient()

  const { data: categories } = useQuery({
    queryKey: ['document_categories'],
    queryFn: async () => {
      const { data, error } = await supabase.from('document_categories').select('id, label_ru, label_uz')
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
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { is_org_wide: true } })

  useEffect(() => {
    if (open && !isEdit) {
      reset({ is_org_wide: true })
      setDraftId(null)
    }
  }, [open, isEdit, reset])

  useEffect(() => {
    if (existing) {
      reset({
        title: existing.title,
        storage_path: existing.storage_path,
        category_id: existing.category_id ?? '',
        is_org_wide: existing.is_org_wide,
      })
    }
  }, [existing, reset])

  const [draftId, setDraftId] = useState<string | null>(null)
  const effectiveId = documentId ?? draftId

  async function performSave(values: FormValues) {
    const payload = {
      title: values.title,
      storage_path: values.storage_path,
      category_id: values.category_id || null,
      is_org_wide: values.is_org_wide,
    }
    if (effectiveId) {
      const { error } = await supabase.from('documents').update(payload).eq('id', effectiveId)
      if (error) throw error
    } else {
      const { data, error } = await supabase
        .from('documents')
        .insert({ ...payload, uploaded_by: profile?.id ?? null })
        .select('id')
        .single()
      if (error) throw error
      setDraftId(data.id)
    }
    queryClient.invalidateQueries({ queryKey: ['documents'] })
    queryClient.invalidateQueries({ queryKey: ['document-detail', effectiveId] })
  }

  const mutation = useMutation({
    mutationFn: performSave,
    onSuccess: () => {
      toast.success(isEdit ? t('common.save') : 'Документ добавлен')
      onOpenChange(false)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const watched = watch()
  const canAutosave = !!(watched.title && watched.storage_path)
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
          <DialogTitle>{isEdit ? t('common.edit') : t('docs.newDocument')}</DialogTitle>
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
            <Label>{t('docs.category')}</Label>
            <Select
              value={watch('category_id')}
              onValueChange={(v: string | null) => setValue('category_id', v ?? '')}
            >
              <SelectTrigger>
                <SelectValue placeholder="—">
                  {() => pickLabel(categories?.find((c) => c.id === watch('category_id')), i18n.language)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {categories?.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {pickLabel(c, i18n.language)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="is_org_wide"
              checked={watch('is_org_wide')}
              onCheckedChange={(checked) => setValue('is_org_wide', checked === true)}
            />
            <Label htmlFor="is_org_wide" className="font-normal">
              {t('docs.orgWide')}
            </Label>
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

export function CreateDocumentDialog() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus />
        {t('docs.newDocument')}
      </Button>
      <DocumentDialog open={open} onOpenChange={setOpen} documentId={null} />
    </>
  )
}
