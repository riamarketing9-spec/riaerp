import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabaseClient'
import { Card, CardContent } from '@/components/ui/card'
import { BackupExportButton } from './BackupExportButton'

function formatMoney(n: number) {
  return new Intl.NumberFormat('ru-RU').format(n)
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="py-5">
        <p className="text-3xl font-bold tracking-tight">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{label}</p>
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
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">{t('kpi.title')}</h1>
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
