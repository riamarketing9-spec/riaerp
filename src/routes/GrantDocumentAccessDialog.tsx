import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/auth/AuthProvider'
import { Button } from '@/components/ui/button'
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
import { Lock, Trash2 } from 'lucide-react'

export function GrantDocumentAccessDialog({ documentId }: { documentId: string }) {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const { data: profiles } = useQuery({
    queryKey: ['profiles-lookup'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('id, full_name')
      if (error) throw error
      return data
    },
  })

  const { data: grants } = useQuery({
    queryKey: ['document_visibility', documentId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('document_visibility')
        .select('profile_id')
        .eq('document_id', documentId)
      if (error) throw error
      return data
    },
  })

  const mutation = useMutation({
    mutationFn: async (profileId: string) => {
      const { error } = await supabase.from('document_visibility').insert({
        document_id: documentId,
        profile_id: profileId,
        granted_by: profile?.id ?? null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Доступ открыт')
      queryClient.invalidateQueries({ queryKey: ['document_visibility', documentId] })
      setSelected(null)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const revokeMutation = useMutation({
    mutationFn: async (profileId: string) => {
      const { error } = await supabase
        .from('document_visibility')
        .delete()
        .eq('document_id', documentId)
        .eq('profile_id', profileId)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success(t('docs.accessRevoked'))
      queryClient.invalidateQueries({ queryKey: ['document_visibility', documentId] })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  function handleRevoke(profileId: string) {
    if (window.confirm(t('common.delete') + '?')) revokeMutation.mutate(profileId)
  }

  const grantedIds = new Set(grants?.map((g) => g.profile_id))

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <Lock className="size-3.5" />
            {t('docs.grantAccess')}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('docs.grantAccess')}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <Select onValueChange={(v: string | null) => setSelected(v)}>
            <SelectTrigger>
              <SelectValue placeholder="—">
                {() => profiles?.find((p) => p.id === selected)?.full_name}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {profiles
                ?.filter((p) => !grantedIds.has(p.id))
                .map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.full_name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>

          {(grants?.length ?? 0) > 0 && (
            <div className="flex flex-col gap-1">
              {grants?.map((g) => (
                <div key={g.profile_id} className="flex items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    {profiles?.find((p) => p.id === g.profile_id)?.full_name}
                  </p>
                  <button
                    type="button"
                    title={t('docs.revokeAccess')}
                    onClick={() => handleRevoke(g.profile_id)}
                    disabled={revokeMutation.isPending}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button
            disabled={!selected || mutation.isPending}
            onClick={() => selected && mutation.mutate(selected)}
          >
            {t('docs.grantAccess')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
