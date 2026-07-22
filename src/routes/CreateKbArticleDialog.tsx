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
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Plus } from 'lucide-react'

const schema = z.object({
  title: z.string().min(1, 'Обязательное поле'),
  body_markdown: z.string().optional(),
  video_url: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

export function KbArticleDialog({
  open,
  onOpenChange,
  articleId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  articleId: string | null
}) {
  const { t } = useTranslation()
  const isEdit = !!articleId
  const queryClient = useQueryClient()

  const { data: existing } = useQuery({
    queryKey: ['kb-article-detail', articleId],
    enabled: isEdit && open,
    queryFn: async () => {
      const { data, error } = await supabase.from('kb_articles').select('*').eq('id', articleId!).single()
      if (error) throw error
      return data
    },
  })

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  useEffect(() => {
    if (open && !isEdit) {
      reset({})
    }
  }, [open, isEdit, reset])

  useEffect(() => {
    if (existing) {
      reset({
        title: existing.title,
        body_markdown: existing.body_markdown ?? '',
        video_url: existing.video_url ?? '',
      })
    }
  }, [existing, reset])

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const payload = {
        title: values.title,
        body_markdown: values.body_markdown || null,
        video_url: values.video_url || null,
      }
      if (isEdit) {
        const { error } = await supabase.from('kb_articles').update(payload).eq('id', articleId!)
        if (error) throw error
      } else {
        const { error } = await supabase.from('kb_articles').insert(payload)
        if (error) throw error
      }
    },
    onSuccess: () => {
      toast.success(isEdit ? t('common.save') : 'Статья добавлена')
      queryClient.invalidateQueries({ queryKey: ['kb_articles'] })
      queryClient.invalidateQueries({ queryKey: ['kb-article-detail', articleId] })
      reset()
      onOpenChange(false)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('kb_articles').delete().eq('id', articleId!)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success(t('common.delete'))
      queryClient.invalidateQueries({ queryKey: ['kb_articles'] })
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
          <DialogTitle>{isEdit ? t('common.edit') : t('kb.newArticle')}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={handleSubmit((values) => mutation.mutate(values))}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="title">{t('kb.articleTitle')}</Label>
            <Input id="title" {...register('title')} />
            {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="video_url">{t('kb.videoUrl')}</Label>
            <Input id="video_url" placeholder="https://..." {...register('video_url')} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="body_markdown">{t('kb.body')}</Label>
            <Textarea id="body_markdown" rows={4} {...register('body_markdown')} />
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

export function CreateKbArticleDialog() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus />
        {t('kb.newArticle')}
      </Button>
      <KbArticleDialog open={open} onOpenChange={setOpen} articleId={null} />
    </>
  )
}
