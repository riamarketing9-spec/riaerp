import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  DndContext,
  useSensor,
  useSensors,
  PointerSensor,
  useDraggable,
  useDroppable,
  type DragEndEvent,
} from '@dnd-kit/core'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/auth/AuthProvider'
import { Avatar } from '@/components/Avatar'
import { cn } from '@/lib/utils'
import { Plus, User } from 'lucide-react'
import { CreatePositionDialog, PositionDialog } from './CreatePositionDialog'

type OrgPosition = { id: string; title: string; parent_position_id: string | null; profile_id: string | null }
type PersonInfo = { full_name: string | null; avatar_url: string | null }

const ROOT_DROP_ID = '__org_root__'

// Depth-based accent so the eye can tell hierarchy level apart at a glance,
// without relying purely on nesting depth/indentation to read it.
const DEPTH_ACCENTS = [
  'border-brand-400 dark:border-brand-500',
  'border-sky-300 dark:border-sky-600',
  'border-violet-300 dark:border-violet-600',
  'border-amber-300 dark:border-amber-600',
  'border-pink-300 dark:border-pink-600',
]

function isDescendant(childrenOf: Map<string, OrgPosition[]>, ancestorId: string, candidateId: string): boolean {
  const stack = [...(childrenOf.get(ancestorId) ?? [])]
  while (stack.length > 0) {
    const node = stack.pop()!
    if (node.id === candidateId) return true
    stack.push(...(childrenOf.get(node.id) ?? []))
  }
  return false
}

function OrgNodeCard({
  position,
  depth,
  personName,
  personAvatarUrl,
  canManage,
  onEdit,
  onAddChild,
  onAddSibling,
  isDragBlocked,
}: {
  position: OrgPosition
  depth: number
  personName: string | null
  personAvatarUrl?: string | null
  canManage: boolean
  onEdit: (id: string) => void
  onAddChild: (parentId: string) => void
  onAddSibling: (parentId: string | null) => void
  isDragBlocked: boolean
}) {
  const { t } = useTranslation()
  const { attributes, listeners, setNodeRef: setDragRef, transform, isDragging } = useDraggable({
    id: position.id,
    disabled: !canManage,
  })
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: position.id,
    disabled: !canManage || isDragBlocked,
  })
  const accent = DEPTH_ACCENTS[depth % DEPTH_ACCENTS.length]
  const isRoot = depth === 0

  return (
    <div
      ref={setDropRef}
      className={cn('group relative', isOver && 'scale-105')}
      style={{ transition: 'transform 150ms var(--ease-out-strong)' }}
    >
      <div
        ref={setDragRef}
        {...(canManage ? { ...listeners, ...attributes } : {})}
        onClick={() => canManage && !isDragging && onEdit(position.id)}
        style={
          transform
            ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 30 }
            : undefined
        }
        className={cn(
          'flex w-48 cursor-pointer flex-col items-center gap-1.5 rounded-2xl border-2 bg-card px-3 py-3 text-center shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg',
          accent,
          isRoot && 'w-52 bg-brand-500 text-white shadow-md hover:shadow-xl',
          isDragging && 'opacity-40',
          isOver && 'ring-4 ring-brand-300 dark:ring-brand-700'
        )}
      >
        {canManage && (
          <span
            className={cn(
              'absolute -top-2 -left-2 flex size-6 cursor-grab items-center justify-center rounded-full border border-border bg-card text-[10px] text-muted-foreground opacity-0 shadow-sm transition-opacity group-hover:opacity-100 active:cursor-grabbing',
              isRoot && 'bg-brand-600 text-white'
            )}
            title={t('org.dragHandle')}
          >
            ⠿
          </span>
        )}

        {personAvatarUrl !== undefined ? (
          <Avatar
            name={personName ?? position.title}
            avatarUrl={personAvatarUrl}
            className={cn('size-11 rounded-xl', isRoot && 'bg-white/20 text-white')}
          />
        ) : (
          <div
            className={cn(
              'flex size-11 shrink-0 items-center justify-center rounded-xl border-2 border-dashed text-muted-foreground',
              isRoot ? 'border-white/40 text-white/70' : 'border-border'
            )}
          >
            <User className="size-5" />
          </div>
        )}

        <p className="truncate text-sm font-semibold leading-tight">{position.title}</p>
        <p className={cn('truncate text-xs', isRoot ? 'text-white/80' : 'text-muted-foreground')}>
          {personName ?? t('org.vacant')}
        </p>

        {canManage && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onAddChild(position.id)
            }}
            title={t('org.addSubordinate')}
            className={cn(
              'absolute -bottom-3 flex size-7 items-center justify-center rounded-full border border-border bg-brand-500 text-white opacity-0 shadow-sm transition-opacity hover:bg-brand-600 group-hover:opacity-100',
              isRoot && 'border-transparent'
            )}
          >
            <Plus className="size-4" />
          </button>
        )}

        {canManage && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onAddSibling(position.parent_position_id)
            }}
            title={t('org.addSibling')}
            className={cn(
              'absolute top-1/2 -right-3 flex size-7 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card text-muted-foreground opacity-0 shadow-sm transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100',
              isRoot && 'border-white/40 bg-brand-600 text-white hover:bg-brand-700 hover:text-white'
            )}
          >
            <Plus className="size-4" />
          </button>
        )}
      </div>
    </div>
  )
}

function OrgTreeLi({
  position,
  depth,
  childrenOf,
  personFor,
  canManage,
  onEdit,
  onAddChild,
  onAddSibling,
  dragActiveId,
}: {
  position: OrgPosition
  depth: number
  childrenOf: Map<string, OrgPosition[]>
  personFor: (id: string | null) => PersonInfo | undefined
  canManage: boolean
  onEdit: (id: string) => void
  onAddChild: (parentId: string) => void
  onAddSibling: (parentId: string | null) => void
  dragActiveId: string | null
}) {
  const children = childrenOf.get(position.id) ?? []
  const person = personFor(position.profile_id)
  const isDragBlocked =
    !!dragActiveId && (dragActiveId === position.id || isDescendant(childrenOf, dragActiveId, position.id))

  return (
    <li>
      <OrgNodeCard
        position={position}
        depth={depth}
        personName={person?.full_name ?? null}
        personAvatarUrl={position.profile_id ? person?.avatar_url : undefined}
        canManage={canManage}
        onEdit={onEdit}
        onAddChild={onAddChild}
        onAddSibling={onAddSibling}
        isDragBlocked={isDragBlocked}
      />
      {children.length > 0 && (
        <ul>
          {children.map((child) => (
            <OrgTreeLi
              key={child.id}
              position={child}
              depth={depth + 1}
              childrenOf={childrenOf}
              personFor={personFor}
              canManage={canManage}
              onEdit={onEdit}
              onAddChild={onAddChild}
              onAddSibling={onAddSibling}
              dragActiveId={dragActiveId}
            />
          ))}
        </ul>
      )}
    </li>
  )
}

function RootDropZone({ visible }: { visible: boolean }) {
  const { t } = useTranslation()
  const { setNodeRef, isOver } = useDroppable({ id: ROOT_DROP_ID, disabled: !visible })
  if (!visible) return null
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'mx-auto flex w-fit items-center gap-2 rounded-full border-2 border-dashed border-border px-4 py-2 text-xs text-muted-foreground transition-colors',
        isOver && 'border-brand-400 bg-brand-50 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300'
      )}
    >
      {t('org.dropToRoot')}
    </div>
  )
}

export function OrgStructurePage() {
  const { t } = useTranslation()
  const { hasCapability } = useAuth()
  const canManage = hasCapability('org.full_access') || hasCapability('org.structure_manage')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [newPositionParentId, setNewPositionParentId] = useState<string | null | undefined>(undefined)
  const [dragActiveId, setDragActiveId] = useState<string | null>(null)
  const queryClient = useQueryClient()

  // v_org_positions joins the assignee's name/avatar in server-side (see
  // 0053) instead of resolving it from a plain `profiles` select -- that
  // table's RLS is locked to your own row unless you're CEO/finance/
  // cabinets.read_all, so every other position rendered as vacant for
  // anyone without one of those capabilities.
  const { data: positions, isLoading } = useQuery({
    queryKey: ['org_positions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_org_positions')
        .select('id, title, parent_position_id, profile_id, full_name, avatar_url')
      if (error) throw error
      return data
    },
  })

  const personFor = (id: string | null) => {
    const row = positions?.find((p) => p.profile_id === id)
    return row ? { full_name: row.full_name, avatar_url: row.avatar_url } : undefined
  }

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

  const reparent = useMutation({
    mutationFn: async ({ id, parentId }: { id: string; parentId: string | null }) => {
      const { error } = await supabase.from('org_positions').update({ parent_position_id: parentId }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success(t('org.moved'))
      queryClient.invalidateQueries({ queryKey: ['org_positions'] })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  function handleDragEnd(event: DragEndEvent) {
    setDragActiveId(null)
    const { active, over } = event
    if (!over) return
    const activeId = String(active.id)
    const overId = String(over.id)
    if (overId === activeId) return

    const activePosition = positions?.find((p) => p.id === activeId)
    if (!activePosition) return

    if (overId === ROOT_DROP_ID) {
      if (activePosition.parent_position_id !== null) reparent.mutate({ id: activeId, parentId: null })
      return
    }

    if (isDescendant(childrenOf, activeId, overId)) {
      toast.error(t('org.cycleError'))
      return
    }

    if (activePosition.parent_position_id !== overId) {
      reparent.mutate({ id: activeId, parentId: overId })
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <h1 className="text-4xl font-bold tracking-tight">{t('org.title')}</h1>
        {canManage && <CreatePositionDialog />}
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">{t('common.loading')}...</p>}
      {!isLoading && (positions?.length ?? 0) === 0 && (
        <p className="text-sm text-muted-foreground">{t('org.empty')}</p>
      )}

      {(positions?.length ?? 0) > 0 && (
        <DndContext
          sensors={sensors}
          onDragStart={(e) => setDragActiveId(String(e.active.id))}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setDragActiveId(null)}
        >
          <RootDropZone visible={!!dragActiveId && !!positions?.find((p) => p.id === dragActiveId)?.parent_position_id} />

          <div className="org-tree overflow-x-auto pb-10 pt-4">
            <ul>
              {roots.map((root) => (
                <OrgTreeLi
                  key={root.id}
                  position={root}
                  depth={0}
                  childrenOf={childrenOf}
                  personFor={personFor}
                  canManage={canManage}
                  onEdit={setEditingId}
                  onAddChild={(parentId) => setNewPositionParentId(parentId)}
                  onAddSibling={(parentId) => setNewPositionParentId(parentId)}
                  dragActiveId={dragActiveId}
                />
              ))}
            </ul>
          </div>
        </DndContext>
      )}

      {canManage && (
        <>
          <PositionDialog
            open={!!editingId}
            onOpenChange={(open) => !open && setEditingId(null)}
            positionId={editingId}
          />
          <PositionDialog
            open={newPositionParentId !== undefined}
            onOpenChange={(open) => !open && setNewPositionParentId(undefined)}
            positionId={null}
            defaultParentId={newPositionParentId}
          />
        </>
      )}
    </div>
  )
}
