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
import { CreateContentItemDialog } from './CreateContentItemDialog'

export function ContentPlanPage() {
  const { t } = useTranslation()

  const { data: items, isLoading } = useQuery({
    queryKey: ['content_plan_items'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('content_plan_items')
        .select('id, topic, project_id, status_id, shoot_date, publish_date')
        .order('publish_date', { ascending: true, nullsFirst: false })
      if (error) throw error
      return data
    },
  })

  const { data: projects } = useQuery({
    queryKey: ['projects-lookup'],
    queryFn: async () => {
      const { data, error } = await supabase.from('projects').select('id, name')
      if (error) throw error
      return data
    },
  })

  const { data: statuses } = useQuery({
    queryKey: ['content_statuses'],
    queryFn: async () => {
      const { data, error } = await supabase.from('content_statuses').select('id, label_ru')
      if (error) throw error
      return data
    },
  })

  const projectName = (id: string) => projects?.find((p) => p.id === id)?.name ?? '—'
  const statusLabel = (id: string) => statuses?.find((s) => s.id === id)?.label_ru ?? '—'

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{t('contentPlan.title')}</h1>
        <CreateContentItemDialog />
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('contentPlan.topic')}</TableHead>
              <TableHead>{t('contentPlan.project')}</TableHead>
              <TableHead>{t('contentPlan.status')}</TableHead>
              <TableHead>{t('contentPlan.shootDate')}</TableHead>
              <TableHead>{t('contentPlan.publishDate')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  {t('common.loading')}...
                </TableCell>
              </TableRow>
            )}
            {!isLoading && (items?.length ?? 0) === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  {t('contentPlan.empty')}
                </TableCell>
              </TableRow>
            )}
            {items?.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{item.topic}</TableCell>
                <TableCell>{projectName(item.project_id)}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{statusLabel(item.status_id)}</Badge>
                </TableCell>
                <TableCell>
                  {item.shoot_date ? new Date(item.shoot_date).toLocaleDateString('ru-RU') : '—'}
                </TableCell>
                <TableCell>
                  {item.publish_date
                    ? new Date(item.publish_date).toLocaleDateString('ru-RU')
                    : '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
