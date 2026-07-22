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
import { pickLabel } from '@/lib/localizedLabel'

const schema = z.object({
  profile_id: z.string().min(1, 'Обязательное поле'),
  deliverable_type_id: z.string().min(1, 'Обязательное поле'),
  rate: z.string().min(1, 'Обязательное поле'),
  effective_from: z.string().min(1, 'Обязательное поле'),
})

type FormValues = z.infer<typeof schema>

export function RateDialog({
  open,
  onOpenChange,
  rateId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  rateId: string | null
}) {
  const { t, i18n } = useTranslation()
  const isEdit = !!rateId
  const queryClient = useQueryClient()

  const { data: profiles } = useQuery({
    queryKey: ['profiles-lookup'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('id, full_name')
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

  const { data: existing } = useQuery({
    queryKey: ['payroll-rate-detail', rateId],
    enabled: isEdit && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payroll_rate_table')
        .select('id, profile_id, deliverable_type_id, rate, effective_from')
        .eq('id', rateId!)
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
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  useEffect(() => {
    if (open && !isEdit) {
      reset({})
    }
  }, [open, isEdit, reset])

  useEffect(() => {
    if (existing) {
      reset({
        profile_id: existing.profile_id,
        deliverable_type_id: existing.deliverable_type_id,
        rate: String(existing.rate),
        effective_from: existing.effective_from,
      })
    }
  }, [existing, reset])

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const payload = {
        profile_id: values.profile_id,
        deliverable_type_id: values.deliverable_type_id,
        rate: Number(values.rate),
        effective_from: values.effective_from,
      }
      if (isEdit) {
        const { error } = await supabase.from('payroll_rate_table').update(payload).eq('id', rateId!)
        if (error) throw error
      } else {
        const { error } = await supabase.from('payroll_rate_table').insert(payload)
        if (error) throw error
      }
    },
    onSuccess: () => {
      toast.success(isEdit ? t('common.save') : 'Ставка добавлена')
      queryClient.invalidateQueries({ queryKey: ['payroll_rate_table'] })
      queryClient.invalidateQueries({ queryKey: ['payroll-rate-detail', rateId] })
      reset()
      onOpenChange(false)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('payroll_rate_table').delete().eq('id', rateId!)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success(t('common.delete'))
      queryClient.invalidateQueries({ queryKey: ['payroll_rate_table'] })
      onOpenChange(false)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  function handleDelete() {
    if (window.confirm(t('common.delete') + '?')) deleteMutation.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{isEdit ? t('common.edit') : t('payroll.newRate')}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={handleSubmit((values) => mutation.mutate(values))}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-1.5">
            <Label>{t('payroll.employee')}</Label>
            <Select
              value={watch('profile_id')}
              onValueChange={(v: string | null) => setValue('profile_id', v ?? '')}
            >
              <SelectTrigger>
                <SelectValue placeholder="—">
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
            {errors.profile_id && (
              <p className="text-xs text-destructive">{errors.profile_id.message}</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>{t('payroll.deliverableType')}</Label>
            <Select
              value={watch('deliverable_type_id')}
              onValueChange={(v: string | null) => setValue('deliverable_type_id', v ?? '')}
            >
              <SelectTrigger>
                <SelectValue placeholder="—">
                  {() => pickLabel(deliverableTypes?.find((d) => d.id === watch('deliverable_type_id')), i18n.language)}
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
            {errors.deliverable_type_id && (
              <p className="text-xs text-destructive">{errors.deliverable_type_id.message}</p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rate">{t('payroll.rate')}</Label>
              <Input id="rate" type="number" {...register('rate')} />
              {errors.rate && <p className="text-xs text-destructive">{errors.rate.message}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="effective_from">{t('payroll.effectiveFrom')}</Label>
              <Input id="effective_from" type="date" {...register('effective_from')} />
              {errors.effective_from && (
                <p className="text-xs text-destructive">{errors.effective_from.message}</p>
              )}
            </div>
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

export function CreateRateDialog() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus />
        {t('payroll.newRate')}
      </Button>
      <RateDialog open={open} onOpenChange={setOpen} rateId={null} />
    </>
  )
}
