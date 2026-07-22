import { useEffect, useState } from 'react'
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
import { Textarea } from '@/components/ui/textarea'
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
  client_id: z.string().min(1, 'Обязательное поле'),
  stage_id: z.string().min(1, 'Обязательное поле'),
  expected_value: z.string().optional(),
  next_action_date: z.string().optional(),
  notes: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

export function LeadDialog({
  open,
  onOpenChange,
  leadId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  leadId: string | null
}) {
  const { t, i18n } = useTranslation()
  const { profile } = useAuth()
  const isEdit = !!leadId
  const queryClient = useQueryClient()

  const { data: clients } = useQuery({
    queryKey: ['clients-lookup'],
    queryFn: async () => {
      const { data, error } = await supabase.from('clients').select('id, name')
      if (error) throw error
      return data
    },
  })

  const { data: stages } = useQuery({
    queryKey: ['lead_stages'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lead_stages')
        .select('id, label_ru, label_uz')
        .order('sort_order')
      if (error) throw error
      return data
    },
  })

  const { data: existing } = useQuery({
    queryKey: ['lead-detail', leadId],
    enabled: isEdit && open,
    queryFn: async () => {
      const { data, error } = await supabase.from('leads').select('*').eq('id', leadId!).single()
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
        client_id: existing.client_id ?? '',
        stage_id: existing.stage_id,
        expected_value: existing.expected_value != null ? String(existing.expected_value) : '',
        next_action_date: existing.next_action_date ?? '',
        notes: existing.notes ?? '',
      })
    }
  }, [existing, reset])

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const payload = {
        client_id: values.client_id,
        stage_id: values.stage_id,
        expected_value: values.expected_value ? Number(values.expected_value) : null,
        next_action_date: values.next_action_date || null,
        notes: values.notes || null,
      }
      if (isEdit) {
        const { error } = await supabase.from('leads').update(payload).eq('id', leadId!)
        if (error) throw error
      } else {
        const { error } = await supabase.from('leads').insert({
          ...payload,
          owner_profile_id: profile?.id ?? null,
        })
        if (error) throw error
      }
    },
    onSuccess: () => {
      toast.success(isEdit ? t('common.save') : 'Лид создан')
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      queryClient.invalidateQueries({ queryKey: ['lead-detail', leadId] })
      reset()
      onOpenChange(false)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('leads').delete().eq('id', leadId!)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success(t('common.delete'))
      queryClient.invalidateQueries({ queryKey: ['leads'] })
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
          <DialogTitle>{isEdit ? t('common.edit') : t('leads.newLead')}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={handleSubmit((values) => mutation.mutate(values))}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-1.5">
            <Label>{t('leads.client')}</Label>
            <Select
              value={watch('client_id')}
              onValueChange={(v: string | null) => setValue('client_id', v ?? '')}
            >
              <SelectTrigger>
                <SelectValue placeholder="—">
                  {() => clients?.find((c) => c.id === watch('client_id'))?.name}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {clients?.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.client_id && (
              <p className="text-xs text-destructive">{errors.client_id.message}</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>{t('leads.stage')}</Label>
            <Select
              value={watch('stage_id')}
              onValueChange={(v: string | null) => setValue('stage_id', v ?? '')}
            >
              <SelectTrigger>
                <SelectValue placeholder="—">
                  {() => pickLabel(stages?.find((s) => s.id === watch('stage_id')), i18n.language)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {stages?.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {pickLabel(s, i18n.language)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.stage_id && (
              <p className="text-xs text-destructive">{errors.stage_id.message}</p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="expected_value">{t('leads.expectedValue')}</Label>
              <Input id="expected_value" type="number" {...register('expected_value')} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="next_action_date">{t('leads.nextActionDate')}</Label>
              <Input id="next_action_date" type="date" {...register('next_action_date')} />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notes">{t('leads.notes')}</Label>
            <Textarea id="notes" rows={2} {...register('notes')} />
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

export function CreateLeadDialog() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus />
        {t('leads.newLead')}
      </Button>
      <LeadDialog open={open} onOpenChange={setOpen} leadId={null} />
    </>
  )
}
