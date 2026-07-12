import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabaseClient'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog'
import { Plus, FileDown } from 'lucide-react'

function formatMoney(n: number) {
  return new Intl.NumberFormat('ru-RU').format(n)
}

function GenerateRunDialog() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [month, setMonth] = useState('')
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async () => {
      const periodMonth = `${month}-01`
      const periodEnd = new Date(
        new Date(periodMonth).getFullYear(),
        new Date(periodMonth).getMonth() + 1,
        0
      )
        .toISOString()
        .slice(0, 10)

      const { data: run, error: runErr } = await supabase
        .from('payroll_runs')
        .insert({ period_month: periodMonth })
        .select('id')
        .single()
      if (runErr) throw runErr

      // Fixed component: active monthly salary for this period.
      const { data: salaries, error: salErr } = await supabase
        .from('payroll_fixed_salary')
        .select('profile_id, monthly_amount, effective_from, effective_to')
        .lte('effective_from', periodMonth)
      if (salErr) throw salErr
      const activeFixed = (salaries ?? []).filter(
        (s) => !s.effective_to || s.effective_to >= periodMonth
      )

      // Piece-rate component: count tasks completed in the period per
      // (employee, deliverable type), multiplied by their active rate.
      const { data: doneStatus } = await supabase
        .from('task_statuses')
        .select('id')
        .eq('slug', 'done')
        .single()

      const { data: completedTasks } = await supabase
        .from('tasks')
        .select('assignee_profile_id, deliverable_type_id, completed_at')
        .eq('status_id', doneStatus?.id ?? '')
        .not('deliverable_type_id', 'is', null)
        .gte('completed_at', `${periodMonth}T00:00:00Z`)
        .lte('completed_at', `${periodEnd}T23:59:59Z`)

      const { data: rates, error: ratesErr } = await supabase
        .from('payroll_rate_table')
        .select('profile_id, deliverable_type_id, rate, effective_from, effective_to')
        .lte('effective_from', periodMonth)
      if (ratesErr) throw ratesErr
      const activeRates = (rates ?? []).filter(
        (r) => !r.effective_to || r.effective_to >= periodMonth
      )

      const pieceByProfile = new Map<string, { total: number; detail: Record<string, number> }>()
      for (const rate of activeRates) {
        const count = (completedTasks ?? []).filter(
          (t) =>
            t.assignee_profile_id === rate.profile_id &&
            t.deliverable_type_id === rate.deliverable_type_id
        ).length
        if (count === 0) continue
        const amount = count * rate.rate
        const entry = pieceByProfile.get(rate.profile_id) ?? { total: 0, detail: {} }
        entry.total += amount
        entry.detail[rate.deliverable_type_id] = count
        pieceByProfile.set(rate.profile_id, entry)
      }

      const profileIds = new Set([
        ...activeFixed.map((s) => s.profile_id),
        ...pieceByProfile.keys(),
      ])

      const lines = Array.from(profileIds).map((profileId) => {
        const fixed = activeFixed.find((s) => s.profile_id === profileId)?.monthly_amount ?? 0
        const piece = pieceByProfile.get(profileId)
        return {
          payroll_run_id: run.id,
          profile_id: profileId,
          fixed_component: fixed,
          piece_rate_component: piece?.total ?? 0,
          total: fixed + (piece?.total ?? 0),
          detail_json: piece?.detail ?? {},
        }
      })

      if (lines.length > 0) {
        const { error: lineErr } = await supabase.from('payroll_run_lines').insert(lines)
        if (lineErr) throw lineErr
      }
    },
    onSuccess: () => {
      toast.success('Расчёт сформирован')
      queryClient.invalidateQueries({ queryKey: ['payroll_runs'] })
      setOpen(false)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm">
            <Plus />
            {t('payroll.generateRun')}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('payroll.generateRun')}</DialogTitle>
        </DialogHeader>
        <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        <p className="text-xs text-muted-foreground">
          Фиксированные оклады и сдельная часть (по завершённым задачам с привязанным типом
          работы и ставкой) считаются автоматически. Сумму можно скорректировать вручную после
          генерации.
        </p>
        <DialogFooter>
          <Button disabled={!month || mutation.isPending} onClick={() => mutation.mutate()}>
            {t('payroll.generateRun')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RunLines({ runId, status }: { runId: string; status: string }) {
  const queryClient = useQueryClient()

  const { data: lines } = useQuery({
    queryKey: ['payroll_run_lines', runId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payroll_run_lines')
        .select('id, profile_id, fixed_component, piece_rate_component, total')
        .eq('payroll_run_id', runId)
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

  const updateLine = useMutation({
    mutationFn: async ({ id, piece, fixed }: { id: string; piece: number; fixed: number }) => {
      const { error } = await supabase
        .from('payroll_run_lines')
        .update({ piece_rate_component: piece, total: fixed + piece })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['payroll_run_lines', runId] }),
  })

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Сотрудник</TableHead>
          <TableHead>Фикс</TableHead>
          <TableHead>Сдельно</TableHead>
          <TableHead>Итого</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {lines?.map((line) => (
          <TableRow key={line.id}>
            <TableCell>{profiles?.find((p) => p.id === line.profile_id)?.full_name}</TableCell>
            <TableCell>{formatMoney(line.fixed_component)}</TableCell>
            <TableCell>
              <Input
                type="number"
                defaultValue={line.piece_rate_component}
                disabled={status === 'finalized'}
                className="h-8 w-28"
                onBlur={(e) =>
                  updateLine.mutate({
                    id: line.id,
                    piece: Number(e.target.value),
                    fixed: line.fixed_component,
                  })
                }
              />
            </TableCell>
            <TableCell>{formatMoney(line.fixed_component + line.piece_rate_component)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

async function downloadTaxCsv(runId: string, periodLabel: string) {
  const { data: lines } = await supabase
    .from('payroll_run_lines')
    .select('profile_id, fixed_component, piece_rate_component, total')
    .eq('payroll_run_id', runId)
  const { data: profiles } = await supabase.from('profiles').select('id, full_name')

  const rows = [
    ['ФИО', 'Оклад', 'Сдельная часть', 'Итого начислено'],
    ...(lines ?? []).map((l) => [
      profiles?.find((p) => p.id === l.profile_id)?.full_name ?? l.profile_id,
      String(l.fixed_component),
      String(l.piece_rate_component),
      String(l.total),
    ]),
  ]
  const csv = rows.map((r) => r.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `payroll-${periodLabel}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export function PayrollRuns() {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()

  const { data: runs, isLoading } = useQuery({
    queryKey: ['payroll_runs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payroll_runs')
        .select('id, period_month, status')
        .order('period_month', { ascending: false })
      if (error) throw error
      return data
    },
  })

  const finalize = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('payroll_runs')
        .update({ status: 'finalized' })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Расчёт утверждён')
      queryClient.invalidateQueries({ queryKey: ['payroll_runs'] })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">{t('payroll.runs')}</h2>
        <GenerateRunDialog />
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">{t('common.loading')}...</p>}
      {!isLoading && (runs?.length ?? 0) === 0 && (
        <p className="text-sm text-muted-foreground">{t('payroll.emptyRuns')}</p>
      )}

      {runs?.map((run) => (
        <div key={run.id} className="flex flex-col gap-2 rounded-lg border border-border p-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">
              {new Date(run.period_month).toLocaleDateString(
                i18n.language.startsWith('uz') ? 'uz-Latn-UZ' : 'ru-RU',
                { month: 'long', year: 'numeric' }
              )}
            </p>
            <div className="flex items-center gap-2">
              <Badge variant={run.status === 'finalized' ? 'default' : 'secondary'}>
                {run.status === 'finalized' ? t('payroll.finalized') : t('payroll.draft')}
              </Badge>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  downloadTaxCsv(
                    run.id,
                    new Date(run.period_month).toISOString().slice(0, 7)
                  )
                }
              >
                <FileDown className="size-3.5" />
                CSV
              </Button>
              {run.status === 'draft' && (
                <Button size="sm" variant="outline" onClick={() => finalize.mutate(run.id)}>
                  {t('payroll.finalize')}
                </Button>
              )}
            </div>
          </div>
          <RunLines runId={run.id} status={run.status} />
        </div>
      ))}
    </div>
  )
}
