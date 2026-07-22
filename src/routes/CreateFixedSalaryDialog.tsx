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
  profile_id: z.string().min(1, 'Обязательное поле'),
  monthly_amount: z.string().min(1, 'Обязательное поле'),
  effective_from: z.string().min(1, 'Обязательное поле'),
})

type FormValues = z.infer<typeof schema>

export function FixedSalaryDialog({
  open,
  onOpenChange,
  salaryId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  salaryId: string | null
}) {
  const { t } = useTranslation()
  const isEdit = !!salaryId
  const queryClient = useQueryClient()

  const { data: profiles } = useQuery({
    queryKey: ['profiles-lookup'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('id, full_name')
      if (error) throw error
      return data
    },
  })

  const { data: existing } = useQuery({
    queryKey: ['payroll-fixed-salary-detail', salaryId],
    enabled: isEdit && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payroll_fixed_salary')
        .select('id, profile_id, monthly_amount, effective_from')
        .eq('id', salaryId!)
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
        monthly_amount: String(existing.monthly_amount),
        effective_from: existing.effective_from,
      })
    }
  }, [existing, reset])

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const payload = {
        profile_id: values.profile_id,
        monthly_amount: Number(values.monthly_amount),
        effective_from: values.effective_from,
      }
      if (isEdit) {
        const { error } = await supabase
          .from('payroll_fixed_salary')
          .update(payload)
          .eq('id', salaryId!)
        if (error) throw error
      } else {
        const { error } = await supabase.from('payroll_fixed_salary').insert(payload)
        if (error) throw error
      }
    },
    onSuccess: () => {
      toast.success(isEdit ? t('common.save') : 'Оклад добавлен')
      queryClient.invalidateQueries({ queryKey: ['payroll_fixed_salary'] })
      queryClient.invalidateQueries({ queryKey: ['payroll-fixed-salary-detail', salaryId] })
      reset()
      onOpenChange(false)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('payroll_fixed_salary').delete().eq('id', salaryId!)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success(t('common.delete'))
      queryClient.invalidateQueries({ queryKey: ['payroll_fixed_salary'] })
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
          <DialogTitle>{isEdit ? t('common.edit') : t('payroll.newFixedSalary')}</DialogTitle>
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
            <Label htmlFor="monthly_amount">{t('payroll.monthlyAmount')}</Label>
            <Input id="monthly_amount" type="number" {...register('monthly_amount')} />
            {errors.monthly_amount && (
              <p className="text-xs text-destructive">{errors.monthly_amount.message}</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="effective_from">{t('payroll.effectiveFrom')}</Label>
            <Input id="effective_from" type="date" {...register('effective_from')} />
            {errors.effective_from && (
              <p className="text-xs text-destructive">{errors.effective_from.message}</p>
            )}
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

export function CreateFixedSalaryDialog() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus />
        {t('payroll.newFixedSalary')}
      </Button>
      <FixedSalaryDialog open={open} onOpenChange={setOpen} salaryId={null} />
    </>
  )
}
