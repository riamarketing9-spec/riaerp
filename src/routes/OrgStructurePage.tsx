import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/auth/AuthProvider'
import { Card, CardContent } from '@/components/ui/card'
import { CreatePositionDialog, PositionDialog } from './CreatePositionDialog'

export function OrgStructurePage() {
  const { t } = useTranslation()
  const { hasCapability } = useAuth()
  const canManage = hasCapability('org.full_access') || hasCapability('org.structure_manage')
  const [editingId, setEditingId] = useState<string | null>(null)

  const { data: positions, isLoading } = useQuery({
    queryKey: ['org_positions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('org_positions')
        .select('id, title, parent_position_id, profile_id')
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

  const personName = (id: string | null) =>
    id ? (profiles?.find((p) => p.id === id)?.full_name ?? '—') : t('org.none')
  const parentTitle = (id: string | null) =>
    id ? (positions?.find((p) => p.id === id)?.title ?? '—') : t('org.none')

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">{t('org.title')}</h1>
        {canManage && <CreatePositionDialog />}
      </div>

      <div className="flex flex-col gap-2">
        {isLoading && <p className="text-sm text-muted-foreground">{t('common.loading')}...</p>}
        {!isLoading && (positions?.length ?? 0) === 0 && (
          <p className="text-sm text-muted-foreground">{t('org.empty')}</p>
        )}
        {positions?.map((p) => (
          <Card
            key={p.id}
            className={canManage ? 'cursor-pointer transition-colors hover:bg-muted/40' : undefined}
            onClick={() => canManage && setEditingId(p.id)}
          >
            <CardContent className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-medium">{p.title}</p>
                <p className="text-xs text-muted-foreground">{personName(p.profile_id)}</p>
              </div>
              <p className="text-xs text-muted-foreground">
                {t('org.parent')}: {parentTitle(p.parent_position_id)}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {canManage && (
        <PositionDialog
          open={!!editingId}
          onOpenChange={(open) => !open && setEditingId(null)}
          positionId={editingId}
        />
      )}
    </div>
  )
}
