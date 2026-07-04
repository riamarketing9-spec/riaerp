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
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog'
import { Plus } from 'lucide-react'

const schema = z.object({
  title: z.string().min(1, 'Обязательное поле'),
  storage_path: z.string().min(1, 'Обязательное поле'),
  category_id: z.string().optional(),
  is_org_wide: z.boolean(),
})

type FormValues = z.infer<typeof schema>

export function CreateDocumentDialog() {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()

  const { data: categories } = useQuery({
    queryKey: ['document_categories'],
    queryFn: async () => {
      const { data, error } = await supabase.from('document_categories').select('id, label_ru')
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

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const { error } = await supabase.from('documents').insert({
        title: values.title,
        storage_path: values.storage_path,
        category_id: values.category_id || null,
        is_org_wide: values.is_org_wide,
        uploaded_by: profile?.id ?? null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Документ добавлен')
      queryClient.invalidateQueries({ queryKey: ['documents'] })
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
            {t('docs.newDocument')}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('docs.newDocument')}</DialogTitle>
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
            <Input id="storage_path" placeholder="https://..." {...register('storage_path')} />
            {errors.storage_path && (
              <p className="text-xs text-destructive">{errors.storage_path.message}</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>{t('docs.category')}</Label>
            <Select onValueChange={(v: string | null) => setValue('category_id', v ?? '')}>
              <SelectTrigger>
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                {categories?.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.label_ru}
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
