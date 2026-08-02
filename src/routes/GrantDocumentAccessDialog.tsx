import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/auth/AuthProvider'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Lock } from 'lucide-react'

export function GrantDocumentAccessDialog({ documentId }: { documentId: string }) {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()

  const { data: profiles } = useQuery({
    queryKey: ['profiles-lookup-active'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('id, full_name').is('deleted_at', null)
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

  const grantMutation = useMutation({
    mutationFn: async (profileId: string) => {
      const { error } = await supabase.from('document_visibility').insert({
        document_id: documentId,
        profile_id: profileId,
        granted_by: profile?.id ?? null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['document_visibility', documentId] })
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
      queryClient.invalidateQueries({ queryKey: ['document_visibility', documentId] })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  function toggle(profileId: string, checked: boolean) {
    if (checked) grantMutation.mutate(profileId)
    else revokeMutation.mutate(profileId)
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
        <div className="flex flex-col gap-2 max-h-80 overflow-y-auto">
          {profiles?.map((p) => (
            <div key={p.id} className="flex items-center gap-2">
              <Checkbox
                id={`doc-access-${p.id}`}
                checked={grantedIds.has(p.id)}
                disabled={grantMutation.isPending || revokeMutation.isPending}
                onCheckedChange={(checked) => toggle(p.id, checked === true)}
              />
              <Label htmlFor={`doc-access-${p.id}`} className="font-normal">
                {p.full_name}
              </Label>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
