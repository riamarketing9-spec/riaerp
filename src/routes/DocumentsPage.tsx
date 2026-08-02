import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/auth/AuthProvider'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Combobox } from '@/components/ui/combobox'
import { CreateDocumentDialog, DocumentDialog } from './CreateDocumentDialog'
import { normalizeUrl } from '@/lib/utils'

type DocKind = 'document' | 'contract'

function DocList({
  kind,
  documents,
  canAdmin,
  showEmployee,
  personName,
  onEdit,
  emptyLabel,
}: {
  kind: DocKind
  documents: Array<{ id: string; title: string; storage_path: string; note: string | null; profile_id: string | null; kind: DocKind }>
  canAdmin: boolean
  showEmployee: boolean
  personName: (id: string | null) => string
  onEdit: (id: string) => void
  emptyLabel: string
}) {
  const rows = documents.filter((d) => d.kind === kind)
  return (
    <div className="flex flex-col gap-2">
      {rows.length === 0 && <p className="text-sm text-muted-foreground">{emptyLabel}</p>}
      {rows.map((doc) => (
        <Card
          key={doc.id}
          className={canAdmin ? 'cursor-pointer' : undefined}
          onClick={() => canAdmin && onEdit(doc.id)}
        >
          <CardContent className="flex items-center justify-between gap-3 py-3">
            <div className="flex min-w-0 flex-col gap-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={normalizeUrl(doc.storage_path)}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-300"
                >
                  {doc.title}
                </a>
                {showEmployee && (
                  <span className="text-xs text-muted-foreground">· {personName(doc.profile_id)}</span>
                )}
              </div>
              {doc.note && <p className="truncate text-xs text-muted-foreground">{doc.note}</p>}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

export function DocumentsPage() {
  const { t } = useTranslation()
  const { hasCapability } = useAuth()
  const canAdmin = hasCapability('docs.admin')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [employeeFilter, setEmployeeFilter] = useState('')

  const { data: documents, isLoading } = useQuery({
    queryKey: ['documents'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('documents')
        .select('id, title, storage_path, note, profile_id, kind')
      if (error) throw error
      return data
    },
  })

  const { data: profiles } = useQuery({
    queryKey: ['profiles-lookup-active'],
    enabled: canAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('id, full_name').is('deleted_at', null)
      if (error) throw error
      return data
    },
  })

  const personName = (id: string | null) => profiles?.find((p) => p.id === id)?.full_name ?? t('org.none')

  const visibleDocuments = useMemo(
    () => (documents ?? []).filter((d) => !employeeFilter || d.profile_id === employeeFilter),
    [documents, employeeFilter]
  )

  const editingDoc = documents?.find((d) => d.id === editingId)

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-4xl font-bold tracking-tight">{t('docs.title')}</h1>

      {canAdmin && (
        <div className="flex items-end gap-3 rounded-lg border border-border p-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-muted-foreground">{t('docs.employee')}</label>
            <Combobox
              options={(profiles ?? []).map((p) => ({ value: p.id, label: p.full_name }))}
              value={employeeFilter}
              onChange={setEmployeeFilter}
              placeholder={t('docs.allEmployees')}
              className="w-56"
            />
          </div>
        </div>
      )}

      {isLoading && <p className="text-sm text-muted-foreground">{t('common.loading')}...</p>}

      {!isLoading && (
        <Tabs defaultValue="document">
          <div className="flex items-center justify-between">
            <TabsList>
              <TabsTrigger value="document">{t('docs.tabDocuments')}</TabsTrigger>
              <TabsTrigger value="contract">{t('docs.tabContracts')}</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="document" className="flex flex-col gap-3 pt-3">
            {canAdmin && <CreateDocumentDialog kind="document" defaultProfileId={employeeFilter || null} />}
            <DocList
              kind="document"
              documents={visibleDocuments}
              canAdmin={canAdmin}
              showEmployee={canAdmin}
              personName={personName}
              onEdit={setEditingId}
              emptyLabel={t('docs.empty')}
            />
          </TabsContent>

          <TabsContent value="contract" className="flex flex-col gap-3 pt-3">
            {canAdmin && <CreateDocumentDialog kind="contract" defaultProfileId={employeeFilter || null} />}
            <DocList
              kind="contract"
              documents={visibleDocuments}
              canAdmin={canAdmin}
              showEmployee={canAdmin}
              personName={personName}
              onEdit={setEditingId}
              emptyLabel={t('docs.emptyContracts')}
            />
          </TabsContent>
        </Tabs>
      )}

      {canAdmin && (
        <DocumentDialog
          open={!!editingId}
          onOpenChange={(open) => !open && setEditingId(null)}
          documentId={editingId}
          kind={editingDoc?.kind ?? 'document'}
        />
      )}
    </div>
  )
}
