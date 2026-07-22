import { useState } from 'react'
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
import { Card, CardContent } from '@/components/ui/card'
import { CreateRevenueDialog, RevenueDialog } from './CreateRevenueDialog'
import { CreateExpenseDialog, ExpenseDialog } from './CreateExpenseDialog'
import { PayrollSection } from './PayrollSection'
import { formatLocalDate } from '@/lib/localizedLabel'

function formatMoney(n: number) {
  return new Intl.NumberFormat('ru-RU').format(n)
}

export function FinancePage() {
  const { t, i18n } = useTranslation()
  const [editingRevenueId, setEditingRevenueId] = useState<string | null>(null)
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null)

  const { data: revenue, isLoading: loadingRevenue } = useQuery({
    queryKey: ['finance_project_revenue'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('finance_project_revenue')
        .select('id, project_id, month, amount')
        .order('month', { ascending: false })
      if (error) throw error
      return data
    },
  })

  const { data: expenses, isLoading: loadingExpenses } = useQuery({
    queryKey: ['finance_expenses'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('finance_expenses')
        .select('id, expense_date, amount, note, scope_id')
        .order('expense_date', { ascending: false })
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

  const { data: profit } = useQuery({
    queryKey: ['v_project_profit'],
    queryFn: async () => {
      const { data, error } = await supabase.from('v_project_profit').select('*')
      if (error) throw error
      return data
    },
  })

  const projectName = (id: string) => projects?.find((p) => p.id === id)?.name ?? '—'

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t('finance.title')}</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {profit?.map((p) => (
          <Card key={p.project_id}>
            <CardContent className="py-4">
              <p className="text-sm font-medium">{p.name}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t('finance.totalRevenue')}: {formatMoney(p.total_revenue)}
              </p>
              <p className="text-xs text-muted-foreground">
                {t('finance.totalExpenses')}: {formatMoney(p.total_expenses)}
              </p>
              <p className="mt-1 text-sm font-semibold text-brand-700 dark:text-brand-300">
                {t('finance.profit')}: {formatMoney(p.profit)}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="revenue">
        <TabsList>
          <TabsTrigger value="revenue">{t('finance.revenue')}</TabsTrigger>
          <TabsTrigger value="expenses">{t('finance.expenses')}</TabsTrigger>
          <TabsTrigger value="payroll">{t('finance.payroll')}</TabsTrigger>
        </TabsList>

        <TabsContent value="revenue" className="flex flex-col gap-4">
          <div className="flex justify-end">
            <CreateRevenueDialog />
          </div>
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('finance.project')}</TableHead>
                  <TableHead>{t('finance.month')}</TableHead>
                  <TableHead>{t('finance.amount')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingRevenue && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground">
                      {t('common.loading')}...
                    </TableCell>
                  </TableRow>
                )}
                {!loadingRevenue && (revenue?.length ?? 0) === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground">
                      {t('finance.emptyRevenue')}
                    </TableCell>
                  </TableRow>
                )}
                {revenue?.map((r) => (
                  <TableRow
                    key={r.id}
                    className="cursor-pointer"
                    onClick={() => setEditingRevenueId(r.id)}
                  >
                    <TableCell className="font-medium">{projectName(r.project_id)}</TableCell>
                    <TableCell>
                      {new Date(r.month).toLocaleDateString(
                        i18n.language.startsWith('uz') ? 'uz-Latn-UZ' : 'ru-RU',
                        { month: 'long', year: 'numeric' }
                      )}
                    </TableCell>
                    <TableCell>{formatMoney(r.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="expenses" className="flex flex-col gap-4">
          <div className="flex justify-end">
            <CreateExpenseDialog />
          </div>
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('finance.date')}</TableHead>
                  <TableHead>{t('finance.amount')}</TableHead>
                  <TableHead>{t('finance.note')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingExpenses && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground">
                      {t('common.loading')}...
                    </TableCell>
                  </TableRow>
                )}
                {!loadingExpenses && (expenses?.length ?? 0) === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground">
                      {t('finance.emptyExpenses')}
                    </TableCell>
                  </TableRow>
                )}
                {expenses?.map((e) => (
                  <TableRow
                    key={e.id}
                    className="cursor-pointer"
                    onClick={() => setEditingExpenseId(e.id)}
                  >
                    <TableCell>{formatLocalDate(e.expense_date, i18n.language)}</TableCell>
                    <TableCell className="font-medium">{formatMoney(e.amount)}</TableCell>
                    <TableCell className="text-muted-foreground">{e.note ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="payroll">
          <PayrollSection />
        </TabsContent>
      </Tabs>

      <RevenueDialog
        open={!!editingRevenueId}
        onOpenChange={(open) => !open && setEditingRevenueId(null)}
        revenueId={editingRevenueId}
      />
      <ExpenseDialog
        open={!!editingExpenseId}
        onOpenChange={(open) => !open && setEditingExpenseId(null)}
        expenseId={editingExpenseId}
      />
    </div>
  )
}
