import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabaseClient'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { InviteEmployeeDialog } from './InviteEmployeeDialog'
import { Copy } from 'lucide-react'

const BOT_USERNAME = 'riamarketingaibot'

export function TeamPage() {
  const { t } = useTranslation()

  const { data: profiles, isLoading } = useQuery({
    queryKey: ['team-profiles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, role_id, telegram_chat_id')
      if (error) throw error
      return data
    },
  })

  const { data: roles } = useQuery({
    queryKey: ['roles-lookup'],
    queryFn: async () => {
      const { data, error } = await supabase.from('roles').select('id, label_ru')
      if (error) throw error
      return data
    },
  })

  const roleLabel = (id: string) => roles?.find((r) => r.id === id)?.label_ru ?? '—'

  function copyLink(profileId: string) {
    const link = `https://t.me/${BOT_USERNAME}?start=${profileId}`
    navigator.clipboard.writeText(link)
    toast.success(t('team.linkCopied'))
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{t('team.title')}</h1>
        <InviteEmployeeDialog />
      </div>

      <div className="flex flex-col gap-2">
        {isLoading && <p className="text-sm text-muted-foreground">{t('common.loading')}...</p>}
        {profiles?.map((p) => (
          <Card key={p.id}>
            <CardContent className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-medium">{p.full_name}</p>
                <p className="text-xs text-muted-foreground">{roleLabel(p.role_id)}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={p.telegram_chat_id ? 'default' : 'secondary'}>
                  {p.telegram_chat_id ? t('team.telegramConnected') : t('team.telegramNotConnected')}
                </Badge>
                {!p.telegram_chat_id && (
                  <Button size="sm" variant="outline" onClick={() => copyLink(p.id)}>
                    <Copy className="size-3.5" />
                    {t('team.copyLink')}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
