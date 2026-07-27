import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabaseClient'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatCard } from '@/components/StatCard'
import { RevenueProfitChart } from '@/components/charts/RevenueProfitChart'
import { ExpenseDonutChart } from '@/components/charts/ExpenseDonutChart'
import { pickLabel } from '@/lib/localizedLabel'
import { BackupExportButton } from './BackupExportButton'

function formatMoney(n: number) {
  return new Intl.NumberFormat('ru-RU').format(n)
}

const TREND_MONTHS = 6

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function RevenueProfitSection() {
  const { t, i18n } = useTranslation()
  const sinceDate = useMemo(() => {
    const d = new Date()
    d.setMonth(d.getMonth() - (TREND_MONTHS - 1))
    d.setDate(1)
    return d
  }, [])

  const { data: revenueRows } = useQuery({
    queryKey: ['finance_project_revenue-trend', sinceDate.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('finance_project_revenue')
        .select('month, amount')
        .gte('month', sinceDate.toISOString().slice(0, 10))
      if (error) throw error
      return data
    },
  })

  const { data: expenseRows } = useQuery({
    queryKey: ['finance_expenses-trend', sinceDate.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('finance_expenses')
        .select('expense_date, amount')
        .gte('expense_date', sinceDate.toISOString().slice(0, 10))
      if (error) throw error
      return data
    },
  })

  const months = useMemo(() => {
    const list: { key: string; date: Date }[] = []
    for (let i = TREND_MONTHS - 1; i >= 0; i--) {
      const d = new Date(sinceDate)
      d.setMonth(d.getMonth() + (TREND_MONTHS - 1 - i))
      list.push({ key: monthKey(d), date: d })
    }
    return list
  }, [sinceDate])

  const chartData = useMemo(() => {
    const revenueByMonth = new Map<string, number>()
    for (const r of revenueRows ?? []) {
      const k = monthKey(new Date(r.month))
      revenueByMonth.set(k, (revenueByMonth.get(k) ?? 0) + Number(r.amount))
    }
    const expenseByMonth = new Map<string, number>()
    for (const e of expenseRows ?? []) {
      const k = monthKey(new Date(e.expense_date))
      expenseByMonth.set(k, (expenseByMonth.get(k) ?? 0) + Number(e.amount))
    }
    return months.map(({ key, date }) => {
      const revenue = revenueByMonth.get(key) ?? 0
      const expenses = expenseByMonth.get(key) ?? 0
      return {
        monthLabel: date.toLocaleDateString(i18n.language.startsWith('uz') ? 'uz-Latn-UZ' : 'ru-RU', { month: 'short' }),
        revenue,
        profit: revenue - expenses,
      }
    })
  }, [months, revenueRows, expenseRows, i18n.language])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-medium">{t('kpi.revenueProfitTrend')}</CardTitle>
      </CardHeader>
      <CardContent>
        <RevenueProfitChart data={chartData} revenueLabel={t('kpi.mrr')} profitLabel={t('dashboard.netProfit')} />
      </CardContent>
    </Card>
  )
}

function ExpenseBreakdownSection() {
  const { t, i18n } = useTranslation()
  const monthStart = useMemo(() => {
    const d = new Date()
    d.setDate(1)
    return d.toISOString().slice(0, 10)
  }, [])

  const { data: expenses } = useQuery({
    queryKey: ['finance_expenses-by-category', monthStart],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('finance_expenses')
        .select('amount, category_id')
        .gte('expense_date', monthStart)
      if (error) throw error
      return data
    },
  })

  const { data: categories } = useQuery({
    queryKey: ['expense_categories'],
    queryFn: async () => {
      const { data, error } = await supabase.from('expense_categories').select('id, label_ru, label_uz')
      if (error) throw error
      return data
    },
  })

  const slices = useMemo(() => {
    const byCategory = new Map<string, number>()
    for (const e of expenses ?? []) {
      const key = e.category_id ?? '__none__'
      byCategory.set(key, (byCategory.get(key) ?? 0) + Number(e.amount))
    }
    const withLabels = [...byCategory.entries()].map(([id, value]) => ({
      label: id === '__none__' ? t('kpi.otherCategory') : pickLabel(categories?.find((c) => c.id === id), i18n.language) ?? t('kpi.otherCategory'),
      value,
    }))
    withLabels.sort((a, b) => b.value - a.value)
    const top = withLabels.slice(0, 3)
    const rest = withLabels.slice(3).reduce((sum, s) => sum + s.value, 0)
    if (rest > 0) top.push({ label: t('kpi.otherCategory'), value: rest })
    return top
  }, [expenses, categories, i18n.language, t])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-medium">{t('kpi.expenseBreakdown')}</CardTitle>
      </CardHeader>
      <CardContent>
        {slices.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('kpi.expenseBreakdownEmpty')}</p>
        ) : (
          <ExpenseDonutChart slices={slices} totalLabel={t('kpi.totalExpenses')} />
        )}
      </CardContent>
    </Card>
  )
}

export function KpiDashboardPage() {
  const { t } = useTranslation()

  const { data: dashboard, isLoading } = useQuery({
    queryKey: ['v_ceo_dashboard'],
    queryFn: async () => {
      const { data, error } = await supabase.from('v_ceo_dashboard').select('*').single()
      if (error) throw error
      return data
    },
  })

  const { data: profit } = useQuery({
    queryKey: ['v_project_profit'],
    queryFn: async () => {
      const { data, error } = await supabase.from('v_project_profit').select('*')
      if (error) throw error
      return data
    },
  })

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <h1 className="text-4xl font-bold tracking-tight">{t('kpi.title')}</h1>
        <BackupExportButton />
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard
          label={t('kpi.mrr')}
          value={isLoading ? '—' : formatMoney(dashboard?.mrr ?? 0)}
        />
        <StatCard
          label={t('kpi.activeProjects')}
          value={isLoading ? '—' : (dashboard?.active_projects ?? 0)}
        />
        <StatCard
          label={t('kpi.overdueTasks')}
          value={isLoading ? '—' : (dashboard?.overdue_tasks ?? 0)}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <RevenueProfitSection />
        <ExpenseBreakdownSection />
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">{t('kpi.projectProfit')}</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {profit?.map((p) => (
            <Card key={p.project_id}>
              <CardContent className="py-4">
                <p className="text-sm font-medium">{p.name}</p>
                <p className="mt-1 text-sm text-brand-700 dark:text-brand-300">
                  {formatMoney(p.profit)}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
