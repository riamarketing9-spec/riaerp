import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabaseClient'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { CreateTaskDialog } from './CreateTaskDialog'
import { TasksKanban } from './TasksKanban'
import { formatLocalDate } from '@/lib/localizedLabel'

export function TasksPage() {
  const { t, i18n } = useTranslation()

  const { data: tasks, isLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: async () => {
      // Smart-sort: the view already computes sort_score (priority + deadline
      // proximity), but a view's internal ORDER BY isn't guaranteed to survive
      // an outer query — order explicitly here so it's actually honored.
      const { data, error } = await supabase
        .from('v_task_queue')
        .select('id, title, status_id, deadline, percent_complete, is_urgent, is_important, sort_score')
        .order('sort_score', { ascending: false })
        .order('deadline', { ascending: true, nullsFirst: false })
      if (error) throw error
      return data
    },
  })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{t('tasks.title')}</h1>
        <CreateTaskDialog />
      </div>

      <Tabs defaultValue="list">
        <TabsList>
          <TabsTrigger value="list">{t('tasks.title')}</TabsTrigger>
          <TabsTrigger value="kanban">{t('kanban.title')}</TabsTrigger>
        </TabsList>

        <TabsContent value="list">
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('tasks.title')}</TableHead>
                  <TableHead>{t('tasks.deadline')}</TableHead>
                  <TableHead>{t('tasks.percentComplete')}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                      {t('common.loading')}...
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading && (tasks?.length ?? 0) === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                      {t('tasks.empty')}
                    </TableCell>
                  </TableRow>
                )}
                {tasks?.map((task) => (
                  <TableRow key={task.id}>
                    <TableCell className="font-medium">{task.title}</TableCell>
                    <TableCell>{formatLocalDate(task.deadline, i18n.language)}</TableCell>
                    <TableCell>{task.percent_complete}%</TableCell>
                    <TableCell>
                      {task.is_urgent && <Badge variant="destructive">{t('tasks.urgent')}</Badge>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="kanban">
          <TasksKanban />
        </TabsContent>
      </Tabs>
    </div>
  )
}
