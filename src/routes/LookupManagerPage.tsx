import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabaseClient'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { LOOKUP_TABLES, lookupSelectColumns, type LookupTableConfig, type LookupRow } from '@/lib/lookupTables'

// Generic CEO-only admin page for every small reference/lookup table in the
// app (content rubrics, platforms, expense categories, task statuses, ...).
// One config-driven list+form UI (see src/lib/lookupTables.ts) replaces what
// would otherwise be ~16 near-duplicate CRUD panels. Uses a distinct
// ['lookup-admin', table] query key namespace throughout — deliberately NOT
// the plain ['content_formats']-style keys other pages use to populate their
// dropdowns, since two components sharing a literal key with different
// `.select()` column lists can silently corrupt each other's cached data.

function sortRows(rows: LookupRow[], config: LookupTableConfig): LookupRow[] {
  return [...rows].sort((a, b) => {
    if (config.hasSortOrder) {
      const diff = (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0)
      if (diff !== 0) return diff
    }
    return a.slug.localeCompare(b.slug)
  })
}

function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '_')
}

function LookupRowItem({
  row,
  config,
  queryKey,
}: {
  row: LookupRow
  config: LookupTableConfig
  queryKey: readonly unknown[]
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [slug, setSlug] = useState(row.slug)
  const [labelRu, setLabelRu] = useState(row.label_ru ?? '')
  const [labelUz, setLabelUz] = useState(row.label_uz ?? '')
  const [extraValues, setExtraValues] = useState<Record<string, string>>(
    Object.fromEntries(config.extraFields.map((f) => [f.name, String(row[f.name] ?? '')]))
  )

  const updateMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      // The generated Supabase types key `.from()` off a literal table-name
      // union; config.table is a plain string chosen at runtime from that
      // same set, so this dynamic dispatch needs an `any` escape hatch.
      const { error } = await (supabase.from(config.table as any) as any).update(payload).eq('id', row.id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success(t('common.save'))
      queryClient.invalidateQueries({ queryKey })
      setEditing(false)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase.from(config.table as any) as any).delete().eq('id', row.id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success(t('common.delete'))
      queryClient.invalidateQueries({ queryKey })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  function handleDelete() {
    if (window.confirm(t('common.delete') + '?')) deleteMutation.mutate()
  }

  function handleSave() {
    const payload: Record<string, unknown> = { slug: slug.trim() }
    if (config.hasLabels) {
      payload.label_ru = labelRu.trim()
      payload.label_uz = labelUz.trim() || labelRu.trim()
    }
    for (const f of config.extraFields) {
      const n = Number(extraValues[f.name])
      payload[f.name] = Number.isFinite(n) ? n : 0
    }
    updateMutation.mutate(payload)
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-2 rounded-md border border-border p-2.5">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <Label className="text-xs">{t('lookupManager.slug')}</Label>
            <Input value={slug} onChange={(e) => setSlug(e.target.value)} className="h-8" />
          </div>
          {config.hasLabels && (
            <>
              <div className="flex flex-col gap-1">
                <Label className="text-xs">{t('lookupManager.labelRu')}</Label>
                <Input value={labelRu} onChange={(e) => setLabelRu(e.target.value)} className="h-8" />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs">{t('lookupManager.labelUz')}</Label>
                <Input value={labelUz} onChange={(e) => setLabelUz(e.target.value)} className="h-8" />
              </div>
            </>
          )}
          {config.extraFields.map((f) => (
            <div key={f.name} className="flex flex-col gap-1">
              <Label className="text-xs">{t(f.labelKey)}</Label>
              <Input
                type="number"
                value={extraValues[f.name]}
                onChange={(e) => setExtraValues((prev) => ({ ...prev, [f.name]: e.target.value }))}
                className="h-8"
              />
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
            {t('common.cancel')}
          </Button>
          <Button size="sm" disabled={updateMutation.isPending} onClick={handleSave}>
            {t('common.save')}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2.5 py-1.5">
      <div className="flex min-w-0 flex-1 flex-col">
        {config.hasLabels ? (
          <>
            <span className="truncate text-sm">{row.label_ru}</span>
            <span className="truncate text-xs text-muted-foreground">
              {row.label_uz} · {row.slug}
            </span>
          </>
        ) : (
          <span className="truncate text-sm">{row.slug}</span>
        )}
        {config.extraFields.length > 0 && (
          <span className="truncate text-xs text-muted-foreground">
            {config.extraFields.map((f) => `${t(f.labelKey)}: ${String(row[f.name] ?? '—')}`).join(' · ')}
          </span>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          onClick={() => setEditing(true)}
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Pencil className="size-3.5" />
        </button>
        <button
          onClick={handleDelete}
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
    </div>
  )
}

function AddLookupRowForm({ config, queryKey }: { config: LookupTableConfig; queryKey: readonly unknown[] }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [labelRu, setLabelRu] = useState('')
  const [labelUz, setLabelUz] = useState('')
  const [extraValues, setExtraValues] = useState<Record<string, string>>(
    Object.fromEntries(config.extraFields.map((f) => [f.name, '']))
  )

  function reset() {
    setSlug('')
    setSlugTouched(false)
    setLabelRu('')
    setLabelUz('')
    setExtraValues(Object.fromEntries(config.extraFields.map((f) => [f.name, ''])))
  }

  const addMutation = useMutation({
    mutationFn: async () => {
      const finalSlug = slugTouched || !config.hasLabels ? slug.trim() : slugify(labelRu)
      const payload: Record<string, unknown> = { slug: finalSlug }
      if (config.hasLabels) {
        payload.label_ru = labelRu.trim()
        payload.label_uz = labelUz.trim() || labelRu.trim()
      }
      for (const f of config.extraFields) {
        const raw = extraValues[f.name]
        const n = Number(raw)
        payload[f.name] = raw !== '' && Number.isFinite(n) ? n : 0
      }
      const { error } = await (supabase.from(config.table as any) as any).insert(payload)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success(t('lookupManager.added'))
      queryClient.invalidateQueries({ queryKey })
      reset()
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const canSubmit = (config.hasLabels ? labelRu.trim().length > 0 : slug.trim().length > 0) && !addMutation.isPending

  return (
    <div className="flex flex-col gap-2 rounded-md border border-dashed border-border p-2.5">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <div className="flex flex-col gap-1">
          <Label className="text-xs">{t('lookupManager.slug')}</Label>
          <Input
            value={slug}
            onChange={(e) => {
              setSlug(e.target.value)
              setSlugTouched(true)
            }}
            placeholder={config.hasLabels ? t('lookupManager.slugAutoHint') : undefined}
            className="h-8"
          />
        </div>
        {config.hasLabels && (
          <>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">{t('lookupManager.labelRu')}</Label>
              <Input
                value={labelRu}
                onChange={(e) => {
                  setLabelRu(e.target.value)
                  if (!slugTouched) setSlug(slugify(e.target.value))
                }}
                className="h-8"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">{t('lookupManager.labelUz')}</Label>
              <Input value={labelUz} onChange={(e) => setLabelUz(e.target.value)} className="h-8" />
            </div>
          </>
        )}
        {config.extraFields.map((f) => (
          <div key={f.name} className="flex flex-col gap-1">
            <Label className="text-xs">{t(f.labelKey)}</Label>
            <Input
              type="number"
              value={extraValues[f.name]}
              onChange={(e) => setExtraValues((prev) => ({ ...prev, [f.name]: e.target.value }))}
              className="h-8"
            />
          </div>
        ))}
      </div>
      <div className="flex justify-end">
        <Button size="sm" disabled={!canSubmit} onClick={() => addMutation.mutate()}>
          <Plus className="size-3.5" />
          {t('lookupManager.add')}
        </Button>
      </div>
    </div>
  )
}

export function LookupManagerPage() {
  const { t } = useTranslation()
  const [selectedTable, setSelectedTable] = useState<string>(LOOKUP_TABLES[0].table)
  const config = useMemo(
    () => LOOKUP_TABLES.find((c) => c.table === selectedTable) ?? LOOKUP_TABLES[0],
    [selectedTable]
  )
  const queryKey = ['lookup-admin', config.table] as const

  const { data: rows, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await (supabase.from(config.table as any) as any).select(
        lookupSelectColumns(config)
      )
      if (error) throw error
      return data as unknown as LookupRow[]
    },
  })

  const sortedRows = sortRows(rows ?? [], config)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{t('lookupManager.title')}</h1>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">{t('lookupManager.selectTable')}</Label>
        <Select value={selectedTable} onValueChange={(v: string | null) => v && setSelectedTable(v)}>
          <SelectTrigger className="w-full sm:w-72">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LOOKUP_TABLES.map((c) => (
              <SelectItem key={c.table} value={c.table}>
                {t(c.labelKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
        <p className="text-sm font-semibold">{t(config.labelKey)}</p>

        {isLoading && <p className="text-xs text-muted-foreground">{t('common.loading')}...</p>}
        {!isLoading && sortedRows.length === 0 && (
          <p className="text-xs text-muted-foreground">{t('lookupManager.empty')}</p>
        )}

        <div className="flex flex-col gap-2">
          {sortedRows.map((row) => (
            <LookupRowItem key={row.id} row={row} config={config} queryKey={queryKey} />
          ))}
        </div>

        <AddLookupRowForm config={config} queryKey={queryKey} />
      </div>
    </div>
  )
}
