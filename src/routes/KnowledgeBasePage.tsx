import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/auth/AuthProvider'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CreateKbArticleDialog } from './CreateKbArticleDialog'

export function KnowledgeBasePage() {
  const { t } = useTranslation()
  const { hasCapability } = useAuth()
  const canAdmin = hasCapability('docs.admin')

  const { data: articles, isLoading } = useQuery({
    queryKey: ['kb_articles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('kb_articles')
        .select('id, title, body_markdown, video_url')
        .order('sort_order')
      if (error) throw error
      return data
    },
  })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{t('kb.title')}</h1>
        {canAdmin && <CreateKbArticleDialog />}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {isLoading && <p className="text-sm text-muted-foreground">{t('common.loading')}...</p>}
        {!isLoading && (articles?.length ?? 0) === 0 && (
          <p className="text-sm text-muted-foreground">{t('kb.empty')}</p>
        )}
        {articles?.map((a) => (
          <Card key={a.id}>
            <CardHeader>
              <CardTitle className="text-base font-medium">{a.title}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
              {a.video_url && (
                <a
                  href={a.video_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-brand-700 hover:underline dark:text-brand-300"
                >
                  {a.video_url}
                </a>
              )}
              {a.body_markdown && <p className="whitespace-pre-wrap">{a.body_markdown}</p>}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
