import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
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
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog'
import { Plus } from 'lucide-react'

const schema = z.object({
  title: z.string().min(1, 'Обязательное поле'),
  body_markdown: z.string().optional(),
  video_url: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

export function CreateKbArticleDialog() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const { error } = await supabase.from('kb_articles').insert({
        title: values.title,
        body_markdown: values.body_markdown || null,
        video_url: values.video_url || null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Статья добавлена')
      queryClient.invalidateQueries({ queryKey: ['kb_articles'] })
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
            {t('kb.newArticle')}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('kb.newArticle')}</DialogTitle>
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
