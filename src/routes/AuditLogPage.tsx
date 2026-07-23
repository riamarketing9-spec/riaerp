import { useMemo, useState } from 'react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatLocalDate } from '@/lib/localizedLabel'

const TABLE_LABELS: Record<string, string> = {
  tasks: 'Задачи / Vazifalar',
  projects: 'Проекты / Loyihalar',
  content_plan_items: 'Контент-план / Kontent reja',
  clients: 'Клиенты / Mijozlar',
  leads: 'Воронка / Sotuv',
  finance_expenses: 'Расходы / Xarajat',
  finance_project_revenue: 'Доходы / Daromad',
  payroll_runs: 'Зарплата / Oylik',
  documents: 'Документы / Hujjatlar',
  contracts: 'Договоры / Shartnoma',
  profiles: 'Сотрудники / Xodimlar',
}

export function AuditLogPage() {
  const { t, i18n } = useTranslation()
  const [tableFilter, setTableFilter] = useState('')
  const [actorFilter, setActorFilter] = useState('')

  const { data: logs, isLoading } = useQuery({
    queryKey: ['audit_log'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('audit_log')
        .select('id, table_name, record_id, action, actor_profile_id, changed_at')
        .order('changed_at', { ascending: false })
        .limit(300)
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

  const actorName = (id: string | null) => profiles?.find((p) => p.id === id)?.full_name ?? t('audit.system')

  const tables = useMemo(() => {
    const set = new Set((logs ?? []).map((l) => l.table_name))
    return [...set]
  }, [logs])

  const filtered = (logs ?? []).filter((l) => {
    if (tableFilter && l.table_name !== tableFilter) return false
    if (actorFilter && l.actor_profile_id !== actorFilter) return false
    return true
  })

  const actionLabel = (action: string) =>
    action === 'insert' ? t('audit.actionInsert') : action === 'delete' ? t('audit.actionDelete') : t('audit.actionUpdate')

  const actionVariant = (action: string): 'default' | 'destructive' | 'secondary' =>
    action === 'insert' ? 'default' : action === 'delete' ? 'destructive' : 'secondary'

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-3xl font-bold tracking-tight">{t('audit.title')}</h1>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border p-3">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-muted-foreground">{t('audit.table')}</span>
          <Select value={tableFilter} onValueChange={(v: string | null) => setTableFilter(v ?? '')}>
            <SelectTrigger className="w-52">
              <SelectValue placeholder={t('audit.allTables')}>
                {() => TABLE_LABELS[tableFilter] ?? tableFilter}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {tables.map((tbl) => (
                <SelectItem key={tbl} value={tbl}>
                  {TABLE_LABELS[tbl] ?? tbl}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-muted-foreground">{t('audit.actor')}</span>
          <Select value={actorFilter} onValueChange={(v: string | null) => setActorFilter(v ?? '')}>
            <SelectTrigger className="w-52">
              <SelectValue placeholder={t('audit.allEmployees')}>
                {() => actorName(actorFilter)}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {profiles?.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('audit.date')}</TableHead>
              <TableHead>{t('audit.actor')}</TableHead>
              <TableHead>{t('audit.action')}</TableHead>
              <TableHead>{t('audit.table')}</TableHead>
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
            {!isLoading && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  {t('audit.empty')}
                </TableCell>
              </TableRow>
            )}
            {filtered.map((log) => (
              <TableRow key={log.id}>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                  {formatLocalDate(log.changed_at, i18n.language)}{' '}
                  {new Date(log.changed_at).toLocaleTimeString(i18n.language.startsWith('uz') ? 'uz-Latn-UZ' : 'ru-RU', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </TableCell>
                <TableCell className="font-medium">{actorName(log.actor_profile_id)}</TableCell>
                <TableCell>
                  <Badge variant={actionVariant(log.action)}>{actionLabel(log.action)}</Badge>
                </TableCell>
                <TableCell>{TABLE_LABELS[log.table_name] ?? log.table_name}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
