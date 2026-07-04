import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/auth/AuthProvider'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CreateClientDialog } from './CreateClientDialog'

export function ClientsPage() {
  const { t } = useTranslation()
  const { hasCapability } = useAuth()
  const canManage = hasCapability('sales.manage')

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
          <Card key={c.id}>
            <CardContent className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-medium">{c.name}</p>
                {c.contact_name && (
                  <p className="text-xs text-muted-foreground">{c.contact_name}</p>
                )}
              </div>
              <div className="flex gap-2">
                {c.contact_phone && <Badge variant="secondary">{c.contact_phone}</Badge>}
                {c.contact_telegram && <Badge variant="secondary">{c.contact_telegram}</Badge>}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
