import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/auth/AuthProvider'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'

export function ClientHistorySheet({
  open,
  onOpenChange,
  clientId,
  clientName,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  clientId: string | null
  clientName: string
}) {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const [note, setNote] = useState('')

  const { data: interactions, isLoading } = useQuery({
    queryKey: ['client_interactions', clientId],
    enabled: !!clientId && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_interactions')
        .select('id, note, created_at, profile_id')
        .eq('client_id', clientId!)
        .order('created_at', { ascending: false })
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

  const mutation = useMutation({
    mutationFn: async () => {
      if (!clientId) throw new Error('Клиент не выбран')
      const { error } = await supabase.from('client_interactions').insert({
        client_id: clientId,
        profile_id: profile?.id ?? null,
        note,
      })
      if (error) throw error
    },
    onSuccess: () => {
      setNote('')
      queryClient.invalidateQueries({ queryKey: ['client_interactions', clientId] })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>
            {t('clients.history')} — {clientName}
          </SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-4 px-4 pb-4">
          <div className="flex flex-col gap-2">
            <Textarea
              rows={2}
              placeholder={t('clients.noteText')}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <Button
              size="sm"
              className="w-fit"
              disabled={!note || mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              {t('clients.addNote')}
            </Button>
          </div>

          <div className="flex flex-col gap-3 border-t border-border pt-4">
            {isLoading && <p className="text-sm text-muted-foreground">{t('common.loading')}...</p>}
            {!isLoading && (interactions?.length ?? 0) === 0 && (
              <p className="text-sm text-muted-foreground">{t('clients.emptyHistory')}</p>
            )}
            {interactions?.map((i) => (
              <div key={i.id} className="flex flex-col gap-0.5 text-sm">
                <p>{i.note}</p>
                <p className="text-xs text-muted-foreground">
                  {profiles?.find((p) => p.id === i.profile_id)?.full_name ?? '—'} ·{' '}
                  {new Date(i.created_at).toLocaleString('ru-RU')}
                </p>
              </div>
            ))}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
