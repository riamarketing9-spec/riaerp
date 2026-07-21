import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
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
import { supabase } from '@/lib/supabaseClient'
import { cn } from '@/lib/utils'
import { pickLabel } from '@/lib/localizedLabel'
import { TaskSheet } from './TaskSheet'
import { TaskCard, type TaskCardSubtask } from '@/components/TaskCard'

type TaskCardData = {
  id: string
  title: string
  status_id: string
  is_urgent: boolean
  is_important: boolean
  deadline: string | null
  percent_complete: number
  assignee_profile_id: string | null
}

function DraggableCard({
  task,
  onOpen,
  onDelete,
  statusLabel,
  assigneeName,
  subtasks,
}: {
  task: TaskCardData
  onOpen: (id: string) => void
  onDelete: (id: string) => void
  statusLabel: string
  assigneeName?: string
  subtasks?: TaskCardSubtask[]
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
  })
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes} className={cn(isDragging && 'opacity-40')}>
      <TaskCard
        title={task.title}
        statusLabel={statusLabel}
        isImportant={task.is_important}
        deadline={task.deadline}
        percentComplete={task.percent_complete}
        assigneeName={assigneeName}
        subtasks={subtasks}
        onOpen={() => onOpen(task.id)}
        onDelete={() => onDelete(task.id)}
        className="w-64 cursor-grab active:cursor-grabbing"
      />
    </div>
  )
}

function DroppableColumn({
  id,
  label,
  tasks,
  onOpen,
  onDelete,
  statusLabel,
  assigneeNameFor,
  subtasksFor,
}: {
  id: string
  label: string
  tasks: TaskCardData[]
  onOpen: (id: string) => void
  onDelete: (id: string) => void
  statusLabel: string
  assigneeNameFor: (id: string | null) => string | undefined
  subtasksFor: (id: string) => TaskCardSubtask[] | undefined
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
          <DraggableCard
            key={t.id}
            task={t}
            onOpen={onOpen}
            onDelete={onDelete}
            statusLabel={statusLabel}
            assigneeName={assigneeNameFor(t.assignee_profile_id)}
            subtasks={subtasksFor(t.id)}
          />
        ))}
      </div>
    </div>
  )
}

export function TasksKanban() {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const [activeTask, setActiveTask] = useState<TaskCardData | null>(null)
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
        .select('id, title, status_id, is_urgent, is_important, deadline, percent_complete, assignee_profile_id')
      if (error) throw error
      return data as TaskCardData[]
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

  const taskIds = useMemo(() => (tasks ?? []).map((t) => t.id), [tasks])

  const { data: subtasksByTask } = useQuery({
    queryKey: ['task_items-batch', taskIds],
    enabled: taskIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('task_items')
        .select('id, task_id, title, is_done, sort_order')
        .in('task_id', taskIds)
        .order('sort_order')
      if (error) throw error
      const map = new Map<string, TaskCardSubtask[]>()
      for (const item of data) {
        const list = map.get(item.task_id) ?? []
        list.push({ id: item.id, title: item.title, is_done: item.is_done })
        map.set(item.task_id, list)
      }
      return map
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

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('tasks').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks-kanban'] })
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  function handleDelete(id: string) {
    if (window.confirm(t('common.delete') + '?')) deleteMutation.mutate(id)
  }

  const assigneeNameFor = (id: string | null) => profiles?.find((p) => p.id === id)?.full_name
  const subtasksFor = (id: string) => subtasksByTask?.get(id)

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
              onDelete={handleDelete}
              statusLabel={pickLabel(col, i18n.language) ?? ''}
              assigneeNameFor={assigneeNameFor}
              subtasksFor={subtasksFor}
            />
          ))}
        </div>
        <DragOverlay>
          {activeTask && (
            <TaskCard
              title={activeTask.title}
              deadline={activeTask.deadline}
              percentComplete={activeTask.percent_complete}
              onOpen={() => {}}
              className="w-60"
            />
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
