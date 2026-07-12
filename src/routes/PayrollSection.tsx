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
import { CreateFixedSalaryDialog } from './CreateFixedSalaryDialog'
import { CreateRateDialog } from './CreateRateDialog'
import { PayrollRuns } from './PayrollRuns'
import { pickLabel, formatLocalDate } from '@/lib/localizedLabel'

function formatMoney(n: number) {
  return new Intl.NumberFormat('ru-RU').format(n)
}

export function PayrollSection() {
  const { t, i18n } = useTranslation()

  const { data: fixedSalaries, isLoading: loadingFixed } = useQuery({
    queryKey: ['payroll_fixed_salary'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payroll_fixed_salary')
        .select('id, profile_id, monthly_amount, effective_from')
      if (error) throw error
      return data
    },
  })

  const { data: rates, isLoading: loadingRates } = useQuery({
    queryKey: ['payroll_rate_table'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payroll_rate_table')
        .select('id, profile_id, deliverable_type_id, rate, effective_from')
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

  const { data: deliverableTypes } = useQuery({
    queryKey: ['deliverable_types'],
    queryFn: async () => {
      const { data, error } = await supabase.from('deliverable_types').select('id, label_ru, label_uz')
      if (error) throw error
      return data
    },
  })

  const personName = (id: string) => profiles?.find((p) => p.id === id)?.full_name ?? '—'
  const deliverableLabel = (id: string) =>
    pickLabel(deliverableTypes?.find((d) => d.id === id), i18n.language) ?? '—'

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">{t('payroll.fixedSalary')}</h2>
          <CreateFixedSalaryDialog />
        </div>
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('payroll.employee')}</TableHead>
                <TableHead>{t('payroll.monthlyAmount')}</TableHead>
                <TableHead>{t('payroll.effectiveFrom')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingFixed && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground">
                    {t('common.loading')}...
                  </TableCell>
                </TableRow>
              )}
              {!loadingFixed && (fixedSalaries?.length ?? 0) === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground">
                    {t('payroll.emptyFixed')}
                  </TableCell>
                </TableRow>
              )}
              {fixedSalaries?.map((f) => (
                <TableRow key={f.id}>
                  <TableCell className="font-medium">{personName(f.profile_id)}</TableCell>
                  <TableCell>{formatMoney(f.monthly_amount)}</TableCell>
                  <TableCell>{formatLocalDate(f.effective_from, i18n.language)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">{t('payroll.rates')}</h2>
          <CreateRateDialog />
        </div>
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('payroll.employee')}</TableHead>
                <TableHead>{t('payroll.deliverableType')}</TableHead>
                <TableHead>{t('payroll.rate')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingRates && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground">
                    {t('common.loading')}...
                  </TableCell>
                </TableRow>
              )}
              {!loadingRates && (rates?.length ?? 0) === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground">
                    {t('payroll.emptyRates')}
                  </TableCell>
                </TableRow>
              )}
              {rates?.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{personName(r.profile_id)}</TableCell>
                  <TableCell>{deliverableLabel(r.deliverable_type_id)}</TableCell>
                  <TableCell>{formatMoney(r.rate)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <PayrollRuns />
    </div>
  )
}
