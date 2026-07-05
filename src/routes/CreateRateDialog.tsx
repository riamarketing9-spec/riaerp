import { useState } from 'react'
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
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog'
import { Plus } from 'lucide-react'

const schema = z.object({
  profile_id: z.string().min(1, 'Обязательное поле'),
  deliverable_type_id: z.string().min(1, 'Обязательное поле'),
  rate: z.string().min(1, 'Обязательное поле'),
  effective_from: z.string().min(1, 'Обязательное поле'),
})

type FormValues = z.infer<typeof schema>

export function CreateRateDialog() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
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
      const { data, error } = await supabase.from('deliverable_types').select('id, label_ru')
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

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const { error } = await supabase.from('payroll_rate_table').insert({
        profile_id: values.profile_id,
        deliverable_type_id: values.deliverable_type_id,
        rate: Number(values.rate),
        effective_from: values.effective_from,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Ставка добавлена')
      queryClient.invalidateQueries({ queryKey: ['payroll_rate_table'] })
      reset()
      setOpen(false)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm">
            <Plus />
            {t('payroll.newRate')}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('payroll.newRate')}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={handleSubmit((values) => mutation.mutate(values))}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-1.5">
            <Label>{t('payroll.employee')}</Label>
            <Select onValueChange={(v: string | null) => setValue('profile_id', v ?? '')}>
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
            <Select onValueChange={(v: string | null) => setValue('deliverable_type_id', v ?? '')}>
              <SelectTrigger>
                <SelectValue placeholder="—">
                  {() => deliverableTypes?.find((d) => d.id === watch('deliverable_type_id'))?.label_ru}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {deliverableTypes?.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.label_ru}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.deliverable_type_id && (
              <p className="text-xs text-destructive">{errors.deliverable_type_id.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
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
