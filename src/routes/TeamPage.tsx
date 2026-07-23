import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabaseClient'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { InviteEmployeeDialog } from './InviteEmployeeDialog'
import { EditEmployeeDialog } from './EditEmployeeDialog'
import { Copy, Plus, Trash2 } from 'lucide-react'
import { pickLabel } from '@/lib/localizedLabel'
import { telegramDeepLink } from '@/lib/telegram'

function DepartmentsPanel() {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const [labelRu, setLabelRu] = useState('')
  const [labelUz, setLabelUz] = useState('')

  const { data: departments } = useQuery({
    queryKey: ['departments'],
    queryFn: async () => {
      const { data, error } = await supabase.from('departments').select('id, slug, label_ru, label_uz')
      if (error) throw error
      return data
    },
  })

  const addMutation = useMutation({
    mutationFn: async () => {
      const slug = labelRu.trim().toLowerCase().replace(/\s+/g, '_')
      const { error } = await supabase
        .from('departments')
        .insert({ slug, label_ru: labelRu.trim(), label_uz: labelUz.trim() || labelRu.trim() })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success(t('team.departmentAdded'))
      queryClient.invalidateQueries({ queryKey: ['departments'] })
      setLabelRu('')
      setLabelUz('')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('departments').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success(t('team.departmentDeactivated'))
      queryClient.invalidateQueries({ queryKey: ['departments'] })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
      <p className="text-sm font-semibold">{t('team.departments')}</p>
      <div className="flex flex-col gap-2">
        {departments?.map((d) => (
          <div key={d.id} className="flex items-center justify-between rounded-md bg-muted/40 px-2.5 py-1.5">
            <span className="text-sm">{pickLabel(d, i18n.language)}</span>
            <button
              onClick={() => deleteMutation.mutate(d.id)}
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <Label className="text-xs">{t('team.departmentNameRu')}</Label>
          <Input value={labelRu} onChange={(e) => setLabelRu(e.target.value)} className="h-8 w-40" />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">{t('team.departmentNameUz')}</Label>
          <Input value={labelUz} onChange={(e) => setLabelUz(e.target.value)} className="h-8 w-40" />
        </div>
        <Button
          size="sm"
          disabled={!labelRu.trim() || addMutation.isPending}
          onClick={() => addMutation.mutate()}
        >
          <Plus className="size-3.5" />
          {t('team.newDepartment')}
        </Button>
      </div>
    </div>
  )
}

export function TeamPage() {
  const { t, i18n } = useTranslation()
  const [showInactive, setShowInactive] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const { data: profiles, isLoading } = useQuery({
    queryKey: ['team-profiles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, role_id, staff_status_id')
      if (error) throw error
      return data
    },
  })

  const { data: telegramLinks } = useQuery({
    queryKey: ['team-telegram-links'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profile_telegram_links').select('profile_id')
      if (error) throw error
      return data
    },
  })

  const telegramLinkCount = (profileId: string) =>
    (telegramLinks ?? []).filter((l) => l.profile_id === profileId).length

  const { data: roles } = useQuery({
    queryKey: ['roles-lookup'],
    queryFn: async () => {
      const { data, error } = await supabase.from('roles').select('id, slug, label_ru, label_uz')
      if (error) throw error
      return data
    },
  })

  const { data: staffStatuses } = useQuery({
    queryKey: ['staff_statuses'],
    queryFn: async () => {
      const { data, error } = await supabase.from('staff_statuses').select('id, slug, label_ru, label_uz')
      if (error) throw error
      return data
    },
  })

  const roleLabel = (id: string) => pickLabel(roles?.find((r) => r.id === id), i18n.language) ?? '—'
  const statusOf = (id: string | null) => staffStatuses?.find((s) => s.id === id)
  const isInactive = (id: string | null) => statusOf(id)?.slug === 'inactive'

  const visibleProfiles = (profiles ?? []).filter((p) => showInactive || !isInactive(p.staff_status_id))

  function copyLink(profileId: string) {
    navigator.clipboard.writeText(telegramDeepLink(profileId))
    toast.success(t('team.linkCopied'))
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{t('team.title')}</h1>
        <InviteEmployeeDialog />
      </div>

      <DepartmentsPanel />

      <div className="flex items-center gap-2">
        <Checkbox
          id="show-inactive"
          checked={showInactive}
          onCheckedChange={(checked) => setShowInactive(checked === true)}
        />
        <Label htmlFor="show-inactive" className="font-normal">
          {t('team.showInactive')}
        </Label>
      </div>

      <div className="flex flex-col gap-2">
        {isLoading && <p className="text-sm text-muted-foreground">{t('common.loading')}...</p>}
        {visibleProfiles.map((p) => {
          const status = statusOf(p.staff_status_id)
          return (
            <Card
              key={p.id}
              className="cursor-pointer"
              onClick={() => setEditingId(p.id)}
            >
              <CardContent className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-medium">{p.full_name}</p>
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs text-muted-foreground">{roleLabel(p.role_id)}</p>
                    {status && (
                      <Badge variant={status.slug === 'inactive' ? 'secondary' : 'outline'} className="text-[10px]">
                        {pickLabel(status, i18n.language)}
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  {(() => {
                    const count = telegramLinkCount(p.id)
                    return (
                      <Badge variant={count > 0 ? 'default' : 'secondary'}>
                        {count > 0 ? t('team.telegramConnectedCount', { count }) : t('team.telegramNotConnected')}
                      </Badge>
                    )
                  })()}
                  <Button size="sm" variant="outline" onClick={() => copyLink(p.id)}>
                    <Copy className="size-3.5" />
                    {t('team.copyLink')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <EditEmployeeDialog
        profileId={editingId}
        open={!!editingId}
        onOpenChange={(open) => !open && setEditingId(null)}
      />
    </div>
  )
}
