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

const schema = z.object({
  title: z.string().min(1, 'Обязательное поле'),
  parent_position_id: z.string().optional(),
  profile_id: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

export function PositionDialog({
  open,
  onOpenChange,
  positionId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  positionId: string | null
}) {
  const { t } = useTranslation()
  const isEdit = !!positionId
  const queryClient = useQueryClient()

  const { data: positions } = useQuery({
    queryKey: ['org_positions_lookup'],
    queryFn: async () => {
      const { data, error } = await supabase.from('org_positions').select('id, title')
      if (error) throw error
      return data
    },
  })

  const { data: profiles } = useQuery({
    queryKey: ['profiles-lookup'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('id, full_name')
      if (error) throw error
      return data
    },
  })

  const { data: existing } = useQuery({
    queryKey: ['org-position-detail', positionId],
    enabled: isEdit && open,
    queryFn: async () => {
      const { data, error } = await supabase.from('org_positions').select('*').eq('id', positionId!).single()
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
      reset({ title: '', parent_position_id: '', profile_id: '' })
    }
  }, [open, isEdit, reset])

  useEffect(() => {
    if (existing) {
      reset({
        title: existing.title,
        parent_position_id: existing.parent_position_id ?? '',
        profile_id: existing.profile_id ?? '',
      })
    }
  }, [existing, reset])

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const payload = {
        title: values.title,
        parent_position_id: values.parent_position_id || null,
        profile_id: values.profile_id || null,
      }
      if (isEdit) {
        const { error } = await supabase.from('org_positions').update(payload).eq('id', positionId!)
        if (error) throw error
      } else {
        const { error } = await supabase.from('org_positions').insert(payload)
        if (error) throw error
      }
    },
    onSuccess: () => {
      toast.success(isEdit ? t('common.save') : t('org.newPosition'))
      queryClient.invalidateQueries({ queryKey: ['org_positions'] })
      queryClient.invalidateQueries({ queryKey: ['org_positions_lookup'] })
      queryClient.invalidateQueries({ queryKey: ['org-position-detail', positionId] })
      reset()
      onOpenChange(false)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('org_positions').delete().eq('id', positionId!)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success(t('common.delete'))
      queryClient.invalidateQueries({ queryKey: ['org_positions'] })
      queryClient.invalidateQueries({ queryKey: ['org_positions_lookup'] })
      onOpenChange(false)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  function handleDelete() {
    if (window.confirm(t('common.delete') + '?')) deleteMutation.mutate()
  }

  const parentOptions = (positions ?? []).filter((p) => p.id !== positionId)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? t('common.edit') : t('org.newPosition')}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={handleSubmit((values) => mutation.mutate(values))}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="title">{t('org.positionTitle')}</Label>
            <Input id="title" {...register('title')} />
            {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>{t('org.parent')}</Label>
            <Select
              value={watch('parent_position_id')}
              onValueChange={(v: string | null) => setValue('parent_position_id', v ?? '')}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('org.none')}>
                  {() => parentOptions.find((p) => p.id === watch('parent_position_id'))?.title}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {parentOptions.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>{t('org.person')}</Label>
            <Select
              value={watch('profile_id')}
              onValueChange={(v: string | null) => setValue('profile_id', v ?? '')}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('org.none')}>
                  {() => profiles?.find((p) => p.id === watch('profile_id'))?.full_name}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {profiles?.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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

export function CreatePositionDialog() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus />
        {t('org.newPosition')}
      </Button>
      <PositionDialog open={open} onOpenChange={setOpen} positionId={null} />
    </>
  )
}
