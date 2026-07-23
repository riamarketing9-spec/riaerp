import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/auth/AuthProvider'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CreateKbArticleDialog, KbArticleDialog } from './CreateKbArticleDialog'
import { formatLocalDate } from '@/lib/localizedLabel'
import { Check, Pencil } from 'lucide-react'

export function KnowledgeBasePage() {
  const { t, i18n } = useTranslation()
  const { hasCapability, profile } = useAuth()
  const canAdmin = hasCapability('docs.admin')
  // Capability-based, matching kb_reads_select RLS (profile_id = self OR
  // is_ceo()), not the role-slug-based isCeo boolean.
  const isCeo = hasCapability('org.full_access')
  const queryClient = useQueryClient()
  const [editingId, setEditingId] = useState<string | null>(null)

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

  const { data: myReads } = useQuery({
    queryKey: ['kb_reads', profile?.id],
    enabled: !!profile,
    queryFn: async () => {
      const { data, error } = await supabase.from('kb_reads').select('article_id, read_at').eq('profile_id', profile!.id)
      if (error) throw error
      return data
    },
  })

  const { data: allReads } = useQuery({
    queryKey: ['kb_reads-all'],
    enabled: isCeo,
    queryFn: async () => {
      const { data, error } = await supabase.from('kb_reads').select('article_id')
      if (error) throw error
      return data
    },
  })

  const markRead = useMutation({
    mutationFn: async (articleId: string) => {
      const { error } = await supabase.from('kb_reads').insert({ profile_id: profile!.id, article_id: articleId })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success(t('kb.markRead'))
      queryClient.invalidateQueries({ queryKey: ['kb_reads', profile?.id] })
      queryClient.invalidateQueries({ queryKey: ['kb_reads-all'] })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const readAt = (articleId: string) => myReads?.find((r) => r.article_id === articleId)?.read_at
  const readCount = (articleId: string) => (allReads ?? []).filter((r) => r.article_id === articleId).length

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">{t('kb.title')}</h1>
        {canAdmin && <CreateKbArticleDialog />}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {isLoading && <p className="text-sm text-muted-foreground">{t('common.loading')}...</p>}
        {!isLoading && (articles?.length ?? 0) === 0 && (
          <p className="text-sm text-muted-foreground">{t('kb.empty')}</p>
        )}
        {articles?.map((a) => {
          const read = readAt(a.id)
          return (
            <Card key={a.id}>
              <CardHeader className="flex flex-row items-start justify-between gap-2">
                <CardTitle className="text-base font-medium">{a.title}</CardTitle>
                <div className="flex shrink-0 items-center gap-2">
                  {isCeo && (
                    <Badge variant="outline" className="shrink-0">
                      {t('kb.readCount')}: {readCount(a.id)}
                    </Badge>
                  )}
                  {canAdmin && (
                    <button
                      type="button"
                      title={t('common.edit')}
                      onClick={() => setEditingId(a.id)}
                      className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                  )}
                </div>
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

                {read ? (
                  <Badge variant="secondary" className="w-fit gap-1">
                    <Check className="size-3" />
                    {t('kb.readAt')}: {formatLocalDate(read, i18n.language)}
                  </Badge>
                ) : (
                  <Button size="sm" variant="outline" className="w-fit" onClick={() => markRead.mutate(a.id)}>
                    {t('kb.markRead')}
                  </Button>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      <KbArticleDialog
        open={!!editingId}
        onOpenChange={(open) => !open && setEditingId(null)}
        articleId={editingId}
      />
    </div>
  )
}
