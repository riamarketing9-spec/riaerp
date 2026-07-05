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
  title: z.string().min(1, 'Обязательное поле'),
  parent_position_id: z.string().optional(),
  profile_id: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

export function CreatePositionDialog() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
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
      const { error } = await supabase.from('org_positions').insert({
        title: values.title,
        parent_position_id: values.parent_position_id || null,
        profile_id: values.profile_id || null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Должность добавлена')
      queryClient.invalidateQueries({ queryKey: ['org_positions'] })
      queryClient.invalidateQueries({ queryKey: ['org_positions_lookup'] })
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
            {t('org.newPosition')}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('org.newPosition')}</DialogTitle>
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
            <Select onValueChange={(v: string | null) => setValue('parent_position_id', v ?? '')}>
              <SelectTrigger>
                <SelectValue placeholder={t('org.none')}>
                  {() => positions?.find((p) => p.id === watch('parent_position_id'))?.title}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {positions?.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>{t('org.person')}</Label>
            <Select onValueChange={(v: string | null) => setValue('profile_id', v ?? '')}>
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
