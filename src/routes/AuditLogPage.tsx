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

// Only a handful of columns actually mean something to a human reading the
// log -- everything else (id, timestamps the trigger itself stamps, etc.)
// is noise. Anything not listed here just falls back to its raw column
// name, which is still far better than nothing.
const FIELD_LABELS: Record<string, string> = {
  title: 'Название',
  name: 'Название',
  full_name: 'Имя',
  topic: 'Тема',
  status_id: 'Статус',
  quadrant_id: 'Приоритет',
  deadline: 'Дедлайн',
  percent_complete: 'Готовность, %',
  assignee_profile_id: 'Исполнитель',
  pm_profile_id: 'Менеджер проекта',
  project_id: 'Проект',
  client_id: 'Клиент',
  logo_url: 'Логотип',
  goal: 'Цель',
  amount: 'Сумма',
  shoot_date: 'Дата съёмки',
  publish_date: 'Дата публикации',
  format_id: 'Формат',
  rubric_id: 'Рубрика',
  reference_url: 'Ссылка',
  storage_path: 'Файл',
  role_id: 'Роль',
  department_id: 'Отдел',
  is_active: 'Активен',
  phone: 'Телефон',
  email: 'Email',
  avatar_url: 'Фото',
}

const IGNORED_DIFF_FIELDS = new Set(['id', 'created_at', 'updated_at'])

const DATE_FIELDS = new Set(['deadline', 'shoot_date', 'publish_date', 'completed_at', 'billing_day'])

type Diff = { old?: Record<string, unknown>; new?: Record<string, unknown> } | null

function recordLabel(diff: Diff): string | null {
  const obj = diff?.new ?? diff?.old
  if (!obj) return null
  const candidate = obj.title ?? obj.name ?? obj.full_name ?? obj.topic ?? obj.label_ru
  return typeof candidate === 'string' && candidate.trim() ? candidate : null
}

function formatDiffValue(field: string, value: unknown, profiles?: { id: string; full_name: string }[]): string {
  if (value === null || value === undefined || value === '') return '—'
  if (field.endsWith('_profile_id') && typeof value === 'string') {
    return profiles?.find((p) => p.id === value)?.full_name ?? value.slice(0, 8)
  }
  if (typeof value === 'boolean') return value ? 'Да' : 'Нет'
  if (DATE_FIELDS.has(field) && typeof value === 'string') {
    const d = new Date(value)
    if (!Number.isNaN(d.getTime())) return d.toLocaleDateString('ru-RU')
  }
  const str = String(value)
  return str.length > 50 ? str.slice(0, 50) + '…' : str
}

function changedFields(diff: Diff): { field: string; from: unknown; to: unknown }[] {
  if (!diff?.old || !diff?.new) return []
  const keys = new Set([...Object.keys(diff.old), ...Object.keys(diff.new)])
  const changes: { field: string; from: unknown; to: unknown }[] = []
  for (const key of keys) {
    if (IGNORED_DIFF_FIELDS.has(key)) continue
    const a = diff.old[key]
    const b = diff.new[key]
    if (JSON.stringify(a) !== JSON.stringify(b)) changes.push({ field: key, from: a, to: b })
  }
  return changes
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
        .select('id, table_name, record_id, action, actor_profile_id, changed_at, diff')
        .order('changed_at', { ascending: false })
        .limit(300)
      if (error) throw error
      return data as unknown as {
        id: string
        table_name: string
        record_id: string | null
        action: string
        actor_profile_id: string | null
        changed_at: string
        diff: Diff
      }[]
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
      <h1 className="text-4xl font-bold tracking-tight">{t('audit.title')}</h1>

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
              <TableHead>{t('audit.details')}</TableHead>
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
            {!isLoading && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  {t('audit.empty')}
                </TableCell>
              </TableRow>
            )}
            {filtered.map((log) => {
              const label = recordLabel(log.diff)
              const changes = log.action === 'update' ? changedFields(log.diff) : []
              return (
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
                  <TableCell className="max-w-md">
                    {label && <p className="text-sm font-medium">{label}</p>}
                    {changes.length > 0 && (
                      <ul className="flex flex-col gap-0.5">
                        {changes.map((c) => (
                          <li key={c.field} className="text-xs text-muted-foreground">
                            <span className="font-medium text-foreground">{FIELD_LABELS[c.field] ?? c.field}</span>
                            {': '}
                            {formatDiffValue(c.field, c.from, profiles)} → {formatDiffValue(c.field, c.to, profiles)}
                          </li>
                        ))}
                      </ul>
                    )}
                    {!label && changes.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
