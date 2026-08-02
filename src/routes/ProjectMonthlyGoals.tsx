import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabaseClient'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Pencil, Plus } from 'lucide-react'

function monthLabel(monthValue: string, language: string) {
  return new Date(monthValue).toLocaleDateString(language.startsWith('uz') ? 'uz-Latn-UZ' : 'ru-RU', {
    month: 'long',
    year: 'numeric',
  })
}

export function ProjectMonthlyGoals({ projectId }: { projectId: string }) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const [editingMonth, setEditingMonth] = useState<string | null>(null)
  const [month, setMonth] = useState('')
  const [targetPosts, setTargetPosts] = useState('0')
  const [targetStories, setTargetStories] = useState('0')
  const [targetAds, setTargetAds] = useState(false)
  const [note, setNote] = useState('')

  const { data: goals } = useQuery({
    queryKey: ['project_monthly_goals', projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_monthly_goals')
        .select('id, month, target_posts, target_stories, target_ads, note')
        .eq('project_id', projectId)
        .order('month', { ascending: false })
      if (error) throw error
      return data
    },
  })

  useEffect(() => {
    if (!editingMonth) return
    const existing = goals?.find((g) => g.month.slice(0, 7) === editingMonth)
    setTargetPosts(String(existing?.target_posts ?? 0))
    setTargetStories(String(existing?.target_stories ?? 0))
    setTargetAds(existing?.target_ads ?? false)
    setNote(existing?.note ?? '')
  }, [editingMonth, goals])

  const mutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('project_monthly_goals').upsert(
        {
          project_id: projectId,
          month: `${month}-01`,
          target_posts: Number(targetPosts) || 0,
          target_stories: Number(targetStories) || 0,
          target_ads: targetAds,
          note: note || null,
        },
        { onConflict: 'project_id,month' }
      )
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project_monthly_goals', projectId] })
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
        return (
          <div key={g.id} className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2 py-1.5 text-xs">
            <div className="flex flex-col gap-0.5">
              <span className="font-medium">{monthLabel(g.month, i18n.language)}</span>
              <span className="text-muted-foreground">
                {t('projects.goalPosts')}: {g.target_posts} · {t('projects.goalStories')}: {g.target_stories} ·{' '}
                {t('projects.goalAds')}: {g.target_ads ? t('common.yes') : t('common.no')}
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
          <div className="grid grid-cols-2 gap-1.5">
            <div className="flex flex-col gap-1">
              <Label className="text-[11px] font-normal text-muted-foreground">{t('projects.goalPosts')}</Label>
              <Input
                type="number"
                min={0}
                value={targetPosts}
                onChange={(e) => setTargetPosts(e.target.value)}
                className="h-8"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-[11px] font-normal text-muted-foreground">{t('projects.goalStories')}</Label>
              <Input
                type="number"
                min={0}
                value={targetStories}
                onChange={(e) => setTargetStories(e.target.value)}
                className="h-8"
              />
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Checkbox id="target_ads" checked={targetAds} onCheckedChange={(c) => setTargetAds(c === true)} />
            <Label htmlFor="target_ads" className="font-normal">
              {t('projects.goalAds')}
            </Label>
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
