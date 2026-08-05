import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabaseClient'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Combobox } from '@/components/ui/combobox'
import { pickLabel } from '@/lib/localizedLabel'
import { Pencil, Plus, X } from 'lucide-react'

function monthLabel(monthValue: string, language: string) {
  return new Date(monthValue).toLocaleDateString(language.startsWith('uz') ? 'uz-Latn-UZ' : 'ru-RU', {
    month: 'long',
    year: 'numeric',
  })
}

type TargetRow = { format_id: string; target_count: string }

// Flexible per-work-type goal, same idea as the иш тури field itself: pick
// any content_formats row and type a number next to it, add as many rows
// as needed -- instead of a fixed posts/stories/ads list.
export function ProjectMonthlyGoals({ projectId }: { projectId: string }) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const [editingMonth, setEditingMonth] = useState<string | null>(null)
  const [month, setMonth] = useState('')
  const [note, setNote] = useState('')
  const [rows, setRows] = useState<TargetRow[]>([])

  const { data: contentFormats } = useQuery({
    queryKey: ['content_formats'],
    queryFn: async () => {
      const { data, error } = await supabase.from('content_formats').select('id, label_ru, label_uz')
      if (error) throw error
      return data
    },
  })

  const { data: goals } = useQuery({
    queryKey: ['project_monthly_goals', projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_monthly_goals')
        .select('id, month, note')
        .eq('project_id', projectId)
        .order('month', { ascending: false })
      if (error) throw error
      return data
    },
  })

  const goalIds = (goals ?? []).map((g) => g.id)
  const { data: targetsByGoalId } = useQuery({
    queryKey: ['project_monthly_goal_targets', goalIds],
    enabled: goalIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_monthly_goal_targets')
        .select('goal_id, format_id, target_count')
        .in('goal_id', goalIds)
      if (error) throw error
      const map = new Map<string, { format_id: string; target_count: number }[]>()
      for (const row of data) {
        const list = map.get(row.goal_id) ?? []
        list.push({ format_id: row.format_id, target_count: row.target_count })
        map.set(row.goal_id, list)
      }
      return map
    },
  })

  const formatLabel = (id: string) => pickLabel(contentFormats?.find((f) => f.id === id), i18n.language) ?? ''

  useEffect(() => {
    if (!editingMonth) return
    const existing = goals?.find((g) => g.month.slice(0, 7) === editingMonth)
    setNote(existing?.note ?? '')
    const existingTargets = existing ? targetsByGoalId?.get(existing.id) : undefined
    setRows(
      existingTargets && existingTargets.length > 0
        ? existingTargets.map((t) => ({ format_id: t.format_id, target_count: String(t.target_count) }))
        : [{ format_id: '', target_count: '' }]
    )
  }, [editingMonth, goals, targetsByGoalId])

  function addRow() {
    setRows((prev) => [...prev, { format_id: '', target_count: '' }])
  }
  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index))
  }
  function updateRow(index: number, patch: Partial<TargetRow>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const { data: goal, error: goalErr } = await supabase
        .from('project_monthly_goals')
        .upsert({ project_id: projectId, month: `${month}-01`, note: note || null }, { onConflict: 'project_id,month' })
        .select('id')
        .single()
      if (goalErr) throw goalErr

      await supabase.from('project_monthly_goal_targets').delete().eq('goal_id', goal.id)
      const validRows = rows.filter((r) => r.format_id && Number(r.target_count) > 0)
      if (validRows.length > 0) {
        const { error: targetsErr } = await supabase.from('project_monthly_goal_targets').insert(
          validRows.map((r) => ({ goal_id: goal.id, format_id: r.format_id, target_count: Number(r.target_count) }))
        )
        if (targetsErr) throw targetsErr
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project_monthly_goals', projectId] })
      queryClient.invalidateQueries({ queryKey: ['project_monthly_goal_targets'] })
      queryClient.invalidateQueries({ queryKey: ['project-monthly-goal-current'] })
      setEditingMonth(null)
      setMonth('')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  function startEdit(monthValue: string) {
    setMonth(monthValue)
    setEditingMonth(monthValue)
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label>{t('projects.monthlyGoal')}</Label>

      {goals?.map((g) => {
        const gMonth = g.month.slice(0, 7)
        const targets = targetsByGoalId?.get(g.id) ?? []
        return (
          <div key={g.id} className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2 py-1.5 text-xs">
            <div className="flex flex-col gap-0.5">
              <span className="font-medium">{monthLabel(g.month, i18n.language)}</span>
              <span className="text-muted-foreground">
                {targets.length === 0
                  ? '—'
                  : targets.map((tr) => `${formatLabel(tr.format_id)}: ${tr.target_count}`).join(' · ')}
              </span>
              {g.note && <span className="text-muted-foreground">{g.note}</span>}
            </div>
            <button
              type="button"
              onClick={() => startEdit(gMonth)}
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Pencil className="size-3.5" />
            </button>
          </div>
        )
      })}

      {editingMonth !== null ? (
        <div className="flex flex-col gap-1.5 rounded-md border border-border p-2 pt-1.5">
          <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="h-8" />

          <div className="flex flex-col gap-1.5">
            {rows.map((row, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <Combobox
                  className="h-8 flex-1"
                  options={(contentFormats ?? []).map((f) => ({ value: f.id, label: pickLabel(f, i18n.language) ?? '' }))}
                  value={row.format_id}
                  onChange={(v) => updateRow(i, { format_id: v })}
                  placeholder={t('contentPlan.format')}
                />
                <Input
                  type="number"
                  min={0}
                  value={row.target_count}
                  onChange={(e) => updateRow(i, { target_count: e.target.value })}
                  className="h-8 w-20"
                />
                <button
                  type="button"
                  onClick={() => removeRow(i)}
                  className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
            <Button size="sm" variant="ghost" className="w-fit px-1" onClick={addRow}>
              <Plus className="size-3.5" />
              {t('common.add')}
            </Button>
          </div>

          <Input placeholder={t('projects.goalNote')} value={note} onChange={(e) => setNote(e.target.value)} className="h-8" />
          <div className="flex gap-2">
            <Button size="sm" disabled={!month || mutation.isPending} onClick={() => mutation.mutate()}>
              {t('common.save')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditingMonth(null)}>
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      ) : (
        <Button
          size="sm"
          variant="ghost"
          className="w-fit px-1"
          onClick={() => startEdit(new Date().toISOString().slice(0, 7))}
        >
          <Plus className="size-3.5" />
          {t('projects.addGoal')}
        </Button>
      )}
    </div>
  )
}
