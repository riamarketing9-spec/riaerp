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
  monthly_amount: z.string().min(1, 'Обязательное поле'),
  effective_from: z.string().min(1, 'Обязательное поле'),
})

type FormValues = z.infer<typeof schema>

export function CreateFixedSalaryDialog() {
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

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const { error } = await supabase.from('payroll_fixed_salary').insert({
        profile_id: values.profile_id,
        monthly_amount: Number(values.monthly_amount),
        effective_from: values.effective_from,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Оклад добавлен')
      queryClient.invalidateQueries({ queryKey: ['payroll_fixed_salary'] })
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
            {t('payroll.newFixedSalary')}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('payroll.newFixedSalary')}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={handleSubmit((values) => mutation.mutate(values))}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-1.5">
            <Label>{t('payroll.employee')}</Label>
            <Select onValueChange={(v: string | null) => setValue('profile_id', v ?? '')}>
              <SelectTrigger>
                <SelectValue placeholder="—" />
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
