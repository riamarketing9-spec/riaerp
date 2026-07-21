import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  DndContext,
  DragOverlay,
  useSensor,
  useSensors,
  PointerSensor,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { useDroppable } from '@dnd-kit/core'
import { useDraggable } from '@dnd-kit/core'
import { useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { pickLabel, formatLocalDate } from '@/lib/localizedLabel'
import { TaskSheet } from './TaskSheet'

type TaskCard = {
  id: string
  title: string
  status_id: string
  is_urgent: boolean
  deadline: string | null
  percent_complete: number
}

function DraggableCard({ task, onOpen }: { task: TaskCard; onOpen: (id: string) => void }) {
  const { t, i18n } = useTranslation()
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
  })
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={() => onOpen(task.id)}
      className={cn(
        'cursor-grab rounded-lg border border-border bg-card p-2.5 text-sm shadow-sm active:cursor-grabbing',
        isDragging && 'opacity-40'
      )}
    >
      <p className="font-medium">{task.title}</p>
      <div className="mt-1.5 flex items-center gap-1.5">
        {task.is_urgent && (
          <Badge variant="destructive" className="text-[10px]">
            {t('tasks.urgent')}
          </Badge>
        )}
        {task.deadline && (
          <span className="text-xs text-muted-foreground">
            {formatLocalDate(task.deadline, i18n.language)}
          </span>
        )}
      </div>
    </div>
  )
}

function DroppableColumn({
  id,
  label,
  tasks,
  onOpen,
}: {
  id: string
  label: string
  tasks: TaskCard[]
  onOpen: (id: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex min-h-[120px] w-64 shrink-0 flex-col gap-2 rounded-lg border border-border bg-muted/40 p-2.5',
        isOver && 'ring-2 ring-brand-400'
      )}
    >
      <p className="px-1 text-xs font-semibold text-muted-foreground">
        {label} · {tasks.length}
      </p>
      <div className="flex flex-col gap-2">
        {tasks.map((t) => (
          <DraggableCard key={t.id} task={t} onOpen={onOpen} />
        ))}
      </div>
    </div>
  )
}

export function TasksKanban() {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const [activeTask, setActiveTask] = useState<TaskCard | null>(null)
  const [openTaskId, setOpenTaskId] = useState<string | null>(null)

  const { data: statuses } = useQuery({
    queryKey: ['task_statuses'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('task_statuses')
        .select('id, label_ru, label_uz')
        .order('sort_order')
      if (error) throw error
      return data
    },
  })

  const { data: tasks } = useQuery({
    queryKey: ['tasks-kanban'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select('id, title, status_id, is_urgent, deadline, percent_complete')
      if (error) throw error
      return data as TaskCard[]
    },
  })

  const moveTask = useMutation({
    mutationFn: async ({ id, status_id }: { id: string; status_id: string }) => {
      const { error } = await supabase.from('tasks').update({ status_id }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks-kanban'] })
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['cabinet-tasks'] })
    },
  })

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const columns = useMemo(
    () =>
      (statuses ?? []).map((s) => ({
        ...s,
        tasks: (tasks ?? []).filter((task) => task.status_id === s.id),
      })),
    [statuses, tasks]
  )

  function handleDragStart(event: DragStartEvent) {
    const task = tasks?.find((t) => t.id === event.active.id)
    setActiveTask(task ?? null)
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveTask(null)
    const { active, over } = event
    if (!over) return
    const newStatusId = String(over.id)
    const task = tasks?.find((t) => t.id === active.id)
    if (task && task.status_id !== newStatusId) {
      moveTask.mutate({ id: task.id, status_id: newStatusId })
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold">{t('kanban.title')}</h2>
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {columns.map((col) => (
            <DroppableColumn
              key={col.id}
              id={col.id}
              label={pickLabel(col, i18n.language) ?? ''}
              tasks={col.tasks}
              onOpen={setOpenTaskId}
            />
          ))}
        </div>
        <DragOverlay>
          {activeTask && (
            <Card className="w-60">
              <CardContent className="p-2.5 text-sm font-medium">{activeTask.title}</CardContent>
            </Card>
          )}
        </DragOverlay>
      </DndContext>
      <TaskSheet
        open={!!openTaskId}
        onOpenChange={(open) => !open && setOpenTaskId(null)}
        taskId={openTaskId}
      />
    </div>
  )
}
