import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/auth/AuthProvider'
import { Card, CardContent } from '@/components/ui/card'
import { CreatePositionDialog, PositionDialog } from './CreatePositionDialog'

type OrgPosition = { id: string; title: string; parent_position_id: string | null; profile_id: string | null }

// Recursive hierarchy tree ("кто на кого работает") instead of a flat list
// with a text "parent: X" label -- each node nests visually under its
// manager, with a vertical guide line down to its reports.
function OrgTreeNode({
  position,
  childrenOf,
  personName,
  canManage,
  onEdit,
}: {
  position: OrgPosition
  childrenOf: Map<string, OrgPosition[]>
  personName: (id: string | null) => string
  canManage: boolean
  onEdit: (id: string) => void
}) {
  const children = childrenOf.get(position.id) ?? []
  return (
    <div className="flex flex-col gap-2">
      <Card
        className={canManage ? 'cursor-pointer transition-colors hover:bg-muted/40' : undefined}
        onClick={() => canManage && onEdit(position.id)}
      >
        <CardContent className="flex items-center justify-between py-2.5">
          <p className="text-sm font-medium">{position.title}</p>
          <p className="text-xs text-muted-foreground">{personName(position.profile_id)}</p>
        </CardContent>
      </Card>
      {children.length > 0 && (
        <div className="ml-5 flex flex-col gap-2 border-l border-border pl-5">
          {children.map((child) => (
            <OrgTreeNode
              key={child.id}
              position={child}
              childrenOf={childrenOf}
              personName={personName}
              canManage={canManage}
              onEdit={onEdit}
            />
          ))}
        </div>
      )}
    </div>
  )
}

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

  const { roots, childrenOf } = useMemo(() => {
    const map = new Map<string, OrgPosition[]>()
    const roots: OrgPosition[] = []
    for (const p of positions ?? []) {
      if (p.parent_position_id) {
        const list = map.get(p.parent_position_id) ?? []
        list.push(p)
        map.set(p.parent_position_id, list)
      } else {
        roots.push(p)
      }
    }
    return { roots, childrenOf: map }
  }, [positions])

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <h1 className="text-4xl font-bold tracking-tight">{t('org.title')}</h1>
        {canManage && <CreatePositionDialog />}
      </div>

      <div className="flex flex-col gap-4">
        {isLoading && <p className="text-sm text-muted-foreground">{t('common.loading')}...</p>}
        {!isLoading && (positions?.length ?? 0) === 0 && (
          <p className="text-sm text-muted-foreground">{t('org.empty')}</p>
        )}
        {roots.map((root) => (
          <OrgTreeNode
            key={root.id}
            position={root}
            childrenOf={childrenOf}
            personName={personName}
            canManage={canManage}
            onEdit={setEditingId}
          />
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
