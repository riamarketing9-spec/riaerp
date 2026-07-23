import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/auth/AuthProvider'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { CreateLeadDialog, LeadDialog } from './CreateLeadDialog'
import { pickLabel, formatLocalDate } from '@/lib/localizedLabel'

export function LeadsPage() {
  const { t, i18n } = useTranslation()
  const { hasCapability } = useAuth()
  const canManage = hasCapability('sales.manage')
  const [editingId, setEditingId] = useState<string | null>(null)

  const { data: leads, isLoading } = useQuery({
    queryKey: ['leads'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads')
        .select('id, client_id, stage_id, expected_value, next_action_date')
      if (error) throw error
      return data
    },
  })

  const { data: clients } = useQuery({
    queryKey: ['clients-lookup'],
    queryFn: async () => {
      const { data, error } = await supabase.from('clients').select('id, name')
      if (error) throw error
      return data
    },
  })

  const { data: stages } = useQuery({
    queryKey: ['lead_stages'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lead_stages')
        .select('id, label_ru, label_uz')
        .order('sort_order')
      if (error) throw error
      return data
    },
  })

  const clientName = (id: string) => clients?.find((c) => c.id === id)?.name ?? '—'
  const stageName = (id: string) => pickLabel(stages?.find((s) => s.id === id), i18n.language) ?? '—'

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">{t('leads.title')}</h1>
        {canManage && <CreateLeadDialog />}
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('leads.client')}</TableHead>
              <TableHead>{t('leads.stage')}</TableHead>
              <TableHead>{t('leads.expectedValue')}</TableHead>
              <TableHead>{t('leads.nextActionDate')}</TableHead>
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
            {!isLoading && (leads?.length ?? 0) === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  {t('leads.empty')}
                </TableCell>
              </TableRow>
            )}
            {leads?.map((lead) => (
              <TableRow
                key={lead.id}
                className={canManage ? 'cursor-pointer' : undefined}
                onClick={() => canManage && setEditingId(lead.id)}
              >
                <TableCell className="font-medium">{clientName(lead.client_id)}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{stageName(lead.stage_id)}</Badge>
                </TableCell>
                <TableCell>{lead.expected_value ?? '—'}</TableCell>
                <TableCell>{formatLocalDate(lead.next_action_date, i18n.language)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <LeadDialog
        open={!!editingId}
        onOpenChange={(open) => !open && setEditingId(null)}
        leadId={editingId}
      />
    </div>
  )
}
