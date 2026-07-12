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
import { pickLabel } from '@/lib/localizedLabel'

const schema = z.object({
  expense_date: z.string().min(1, 'Обязательное поле'),
  amount: z.string().min(1, 'Обязательное поле'),
  category_id: z.string().optional(),
  scope_id: z.string().min(1, 'Обязательное поле'),
  project_id: z.string().optional(),
  note: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

export function CreateExpenseDialog() {
  const { t, i18n } = useTranslation()
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()

  const { data: categories } = useQuery({
    queryKey: ['expense_categories'],
    queryFn: async () => {
      const { data, error } = await supabase.from('expense_categories').select('id, label_ru, label_uz')
      if (error) throw error
      return data
    },
  })

  const { data: scopes } = useQuery({
    queryKey: ['expense_scopes'],
    queryFn: async () => {
      const { data, error } = await supabase.from('expense_scopes').select('id, slug')
      if (error) throw error
      return data
    },
  })

  const { data: projects } = useQuery({
    queryKey: ['projects-lookup'],
    queryFn: async () => {
      const { data, error } = await supabase.from('projects').select('id, name')
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
      const { error } = await supabase.from('finance_expenses').insert({
        expense_date: values.expense_date,
        amount: Number(values.amount),
        category_id: values.category_id || null,
        scope_id: values.scope_id,
        project_id: values.project_id || null,
        note: values.note || null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Расход добавлен')
      queryClient.invalidateQueries({ queryKey: ['finance_expenses'] })
      queryClient.invalidateQueries({ queryKey: ['v_project_profit'] })
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
            {t('finance.newExpense')}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('finance.newExpense')}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={handleSubmit((values) => mutation.mutate(values))}
          className="flex flex-col gap-4"
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="expense_date">{t('finance.date')}</Label>
              <Input id="expense_date" type="date" {...register('expense_date')} />
              {errors.expense_date && (
                <p className="text-xs text-destructive">{errors.expense_date.message}</p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="amount">{t('finance.amount')}</Label>
              <Input id="amount" type="number" {...register('amount')} />
              {errors.amount && (
                <p className="text-xs text-destructive">{errors.amount.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label>{t('finance.category')}</Label>
              <Select onValueChange={(v: string | null) => setValue('category_id', v ?? '')}>
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
            <div className="flex flex-col gap-1.5">
              <Label>{t('finance.scope')}</Label>
              <Select onValueChange={(v: string | null) => setValue('scope_id', v ?? '')}>
                <SelectTrigger>
                  <SelectValue placeholder="—">
                    {() => {
                      const s = scopes?.find((s) => s.id === watch('scope_id'))
                      return s ? (s.slug === 'business' ? t('finance.scopeBusiness') : t('finance.scopePersonal')) : null
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {scopes?.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.slug === 'business' ? t('finance.scopeBusiness') : t('finance.scopePersonal')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.scope_id && (
                <p className="text-xs text-destructive">{errors.scope_id.message}</p>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>{t('finance.project')}</Label>
            <Select onValueChange={(v: string | null) => setValue('project_id', v ?? '')}>
              <SelectTrigger>
                <SelectValue placeholder="—">
                  {() => projects?.find((p) => p.id === watch('project_id'))?.name}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {projects?.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="note">{t('finance.note')}</Label>
            <Input id="note" {...register('note')} />
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
