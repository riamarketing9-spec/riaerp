import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/auth/AuthProvider'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { History } from 'lucide-react'
import { CreateClientDialog, ClientDialog } from './CreateClientDialog'
import { ClientHistorySheet } from './ClientHistorySheet'

export function ClientsPage() {
  const { t } = useTranslation()
  const { hasCapability } = useAuth()
  const canManage = hasCapability('sales.manage')
  const [openClientId, setOpenClientId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)

  const { data: clients, isLoading } = useQuery({
    queryKey: ['clients'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('id, name, contact_name, contact_phone, contact_telegram')
      if (error) throw error
      return data
    },
  })

  const openClient = clients?.find((c) => c.id === openClientId)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{t('clients.title')}</h1>
        {canManage && <CreateClientDialog />}
      </div>

      <div className="flex flex-col gap-2">
        {isLoading && <p className="text-sm text-muted-foreground">{t('common.loading')}...</p>}
        {!isLoading && (clients?.length ?? 0) === 0 && (
          <p className="text-sm text-muted-foreground">{t('clients.empty')}</p>
        )}
        {clients?.map((c) => (
          <Card
            key={c.id}
            className="cursor-pointer"
            onClick={() => (canManage ? setEditingId(c.id) : setOpenClientId(c.id))}
          >
            <CardContent className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-medium">{c.name}</p>
                {c.contact_name && (
                  <p className="text-xs text-muted-foreground">{c.contact_name}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {c.contact_phone && <Badge variant="secondary">{c.contact_phone}</Badge>}
                {c.contact_telegram && <Badge variant="secondary">{c.contact_telegram}</Badge>}
                {canManage && (
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation()
                      setOpenClientId(c.id)
                    }}
                    title={t('clients.history')}
                  >
                    <History className="size-3.5" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <ClientDialog
        open={!!editingId}
        onOpenChange={(open) => !open && setEditingId(null)}
        clientId={editingId}
      />

      <ClientHistorySheet
        open={!!openClientId}
        onOpenChange={(open) => !open && setOpenClientId(null)}
        clientId={openClientId}
        clientName={openClient?.name ?? ''}
      />
    </div>
  )
}
