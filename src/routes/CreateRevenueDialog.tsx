import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabaseClient'
import { useAutosave } from '@/hooks/useAutosave'
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
  project_id: z.string().min(1, 'Обязательное поле'),
  month: z.string().min(1, 'Обязательное поле'),
  amount: z.string().min(1, 'Обязательное поле'),
})

type FormValues = z.infer<typeof schema>

export function RevenueDialog({
  open,
  onOpenChange,
  revenueId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  revenueId: string | null
}) {
  const { t } = useTranslation()
  const isEdit = !!revenueId
  const queryClient = useQueryClient()

  const { data: projects } = useQuery({
    queryKey: ['projects-lookup'],
    queryFn: async () => {
      const { data, error } = await supabase.from('projects').select('id, name')
      if (error) throw error
      return data
    },
  })

  const { data: existing } = useQuery({
    queryKey: ['finance-revenue-detail', revenueId],
    enabled: isEdit && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('finance_project_revenue')
        .select('id, project_id, month, amount')
        .eq('id', revenueId!)
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
      setDraftId(null)
    }
  }, [open, isEdit, reset])

  useEffect(() => {
    if (existing) {
      reset({
        project_id: existing.project_id,
        month: existing.month.slice(0, 7),
        amount: String(existing.amount),
      })
    }
  }, [existing, reset])

  const [draftId, setDraftId] = useState<string | null>(null)
  const effectiveId = revenueId ?? draftId

  async function performSave(values: FormValues) {
    const monthDate = `${values.month}-01`
    const payload = {
      project_id: values.project_id,
      month: monthDate,
      amount: Number(values.amount),
    }
    if (effectiveId) {
      const { error } = await supabase
        .from('finance_project_revenue')
        .update(payload)
        .eq('id', effectiveId)
      if (error) throw error
    } else {
      const { data, error } = await supabase
        .from('finance_project_revenue')
        .insert(payload)
        .select('id')
        .single()
      if (error) throw error
      setDraftId(data.id)
    }
    queryClient.invalidateQueries({ queryKey: ['finance_project_revenue'] })
    queryClient.invalidateQueries({ queryKey: ['finance-revenue-detail', effectiveId] })
    queryClient.invalidateQueries({ queryKey: ['v_project_profit'] })
    queryClient.invalidateQueries({ queryKey: ['v_ceo_dashboard'] })
  }

  const mutation = useMutation({
    mutationFn: performSave,
    onSuccess: () => {
      toast.success(isEdit ? t('common.save') : 'Доход добавлен')
      onOpenChange(false)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const watched = watch()
  const canAutosave = !!(watched.project_id && watched.month && watched.amount)
  const autosaveStatus = useAutosave(
    watched,
    async (values) => {
      if (!canAutosave) return
      await performSave(values)
    },
    { enabled: open, resetKey: revenueId }
  )

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('finance_project_revenue')
        .delete()
        .eq('id', revenueId!)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success(t('common.delete'))
      queryClient.invalidateQueries({ queryKey: ['finance_project_revenue'] })
      queryClient.invalidateQueries({ queryKey: ['v_project_profit'] })
      queryClient.invalidateQueries({ queryKey: ['v_ceo_dashboard'] })
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
          <DialogTitle>{isEdit ? t('common.edit') : t('finance.newRevenue')}</DialogTitle>
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
            <Label>{t('finance.project')}</Label>
            <Select
              value={watch('project_id')}
              onValueChange={(v: string | null) => setValue('project_id', v ?? '')}
            >
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
            {errors.project_id && (
              <p className="text-xs text-destructive">{errors.project_id.message}</p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="month">{t('finance.month')}</Label>
              <Input id="month" type="month" {...register('month')} />
              {errors.month && <p className="text-xs text-destructive">{errors.month.message}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="amount">{t('finance.amount')}</Label>
              <Input id="amount" type="number" {...register('amount')} />
              {errors.amount && (
                <p className="text-xs text-destructive">{errors.amount.message}</p>
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
              {effectiveId ? t('common.done') : t('common.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function CreateRevenueDialog() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus />
        {t('finance.newRevenue')}
      </Button>
      <RevenueDialog open={open} onOpenChange={setOpen} revenueId={null} />
    </>
  )
}
