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
  name: z.string().min(1, 'Обязательное поле'),
  status_id: z.string().min(1, 'Обязательное поле'),
  contact_name: z.string().optional(),
  contact_phone: z.string().optional(),
  contact_telegram: z.string().optional(),
  industry_id: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

export function CreateClientDialog() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()

  const { data: statuses } = useQuery({
    queryKey: ['client_statuses'],
    queryFn: async () => {
      const { data, error } = await supabase.from('client_statuses').select('id, label_ru')
      if (error) throw error
      return data
    },
  })

  const { data: industries } = useQuery({
    queryKey: ['industries'],
    queryFn: async () => {
      const { data, error } = await supabase.from('industries').select('id, label_ru')
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
      const { error } = await supabase.from('clients').insert({
        name: values.name,
        status_id: values.status_id,
        contact_name: values.contact_name || null,
        contact_phone: values.contact_phone || null,
        contact_telegram: values.contact_telegram || null,
        industry_id: values.industry_id || null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Клиент добавлен')
      queryClient.invalidateQueries({ queryKey: ['clients'] })
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
            {t('clients.newClient')}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('clients.newClient')}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={handleSubmit((values) => mutation.mutate(values))}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">{t('clients.name')}</Label>
            <Input id="name" {...register('name')} />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="contact_name">{t('clients.contactName')}</Label>
              <Input id="contact_name" {...register('contact_name')} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="contact_phone">{t('clients.contactPhone')}</Label>
              <Input id="contact_phone" {...register('contact_phone')} />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="contact_telegram">{t('clients.contactTelegram')}</Label>
            <Input id="contact_telegram" {...register('contact_telegram')} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>{t('clients.industry')}</Label>
              <Select onValueChange={(v: string | null) => setValue('industry_id', v ?? '')}>
                <SelectTrigger>
                  <SelectValue placeholder="—">
                    {() => industries?.find((i) => i.id === watch('industry_id'))?.label_ru}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {industries?.map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.label_ru}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t('clients.status')}</Label>
              <Select onValueChange={(v: string | null) => setValue('status_id', v ?? '')}>
                <SelectTrigger>
                  <SelectValue placeholder="—">
                    {() => statuses?.find((s) => s.id === watch('status_id'))?.label_ru}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {statuses?.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.label_ru}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.status_id && (
                <p className="text-xs text-destructive">{errors.status_id.message}</p>
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
