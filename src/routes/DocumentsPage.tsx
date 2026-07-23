import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/auth/AuthProvider'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CreateDocumentDialog, DocumentDialog } from './CreateDocumentDialog'
import { GrantDocumentAccessDialog } from './GrantDocumentAccessDialog'

export function DocumentsPage() {
  const { t } = useTranslation()
  const { hasCapability } = useAuth()
  const canAdmin = hasCapability('docs.admin')
  const [editingId, setEditingId] = useState<string | null>(null)

  const { data: documents, isLoading } = useQuery({
    queryKey: ['documents'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('documents')
        .select('id, title, storage_path, is_org_wide')
      if (error) throw error
      return data
    },
  })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">{t('docs.title')}</h1>
        {canAdmin && <CreateDocumentDialog />}
      </div>

      <div className="flex flex-col gap-2">
        {isLoading && <p className="text-sm text-muted-foreground">{t('common.loading')}...</p>}
        {!isLoading && (documents?.length ?? 0) === 0 && (
          <p className="text-sm text-muted-foreground">{t('docs.empty')}</p>
        )}
        {documents?.map((doc) => (
          <Card
            key={doc.id}
            className={canAdmin ? 'cursor-pointer' : undefined}
            onClick={() => canAdmin && setEditingId(doc.id)}
          >
            <CardContent className="flex items-center justify-between py-3">
              <div>
                <a
                  href={doc.storage_path}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-300"
                >
                  {doc.title}
                </a>
                {doc.is_org_wide && (
                  <Badge variant="secondary" className="ml-2 text-[10px]">
                    {t('docs.orgWide')}
                  </Badge>
                )}
              </div>
              {canAdmin && !doc.is_org_wide && (
                <div onClick={(e) => e.stopPropagation()}>
                  <GrantDocumentAccessDialog documentId={doc.id} />
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <DocumentDialog
        open={!!editingId}
        onOpenChange={(open) => !open && setEditingId(null)}
        documentId={editingId}
      />
    </div>
  )
}
