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
import { Badge } from '@/components/ui/badge'

export function TasksPage() {
  const { t } = useTranslation()

  const { data: tasks, isLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_task_queue')
        .select('id, title, status_id, deadline, percent_complete, is_urgent, is_important')
      if (error) throw error
      return data
    },
  })

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t('tasks.title')}</h1>

      <div className="overflow-hidden rounded-lg border border-border">
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
            {tasks?.map((task) => (
              <TableRow key={task.id}>
                <TableCell className="font-medium">{task.title}</TableCell>
                <TableCell>
                  {task.deadline ? new Date(task.deadline).toLocaleDateString('ru-RU') : '—'}
                </TableCell>
                <TableCell>{task.percent_complete}%</TableCell>
                <TableCell>
                  {task.is_urgent && <Badge variant="destructive">Urgent</Badge>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
