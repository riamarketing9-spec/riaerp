import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabaseClient'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus } from 'lucide-react'

export function ProjectMonthlyGoals({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient()
  const [adding, setAdding] = useState(false)
  const [month, setMonth] = useState('')
  const [goalText, setGoalText] = useState('')

  const { data: goals } = useQuery({
    queryKey: ['project_monthly_goals', projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_monthly_goals')
        .select('id, month, goal_text')
        .eq('project_id', projectId)
        .order('month')
      if (error) throw error
      return data
    },
  })

  const mutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('project_monthly_goals').insert({
        project_id: projectId,
        month: `${month}-01`,
        goal_text: goalText,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project_monthly_goals', projectId] })
      setMonth('')
      setGoalText('')
      setAdding(false)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  return (
    <div className="flex flex-col gap-1.5">
      {goals?.map((g) => (
        <div key={g.id} className="flex gap-2 text-xs">
          <span className="font-medium text-muted-foreground">
            {new Date(g.month).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}:
          </span>
          <span>{g.goal_text}</span>
        </div>
      ))}

      {adding ? (
        <div className="flex flex-col gap-1.5 pt-1">
          <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="h-8" />
          <Input
            placeholder="Цель на месяц"
            value={goalText}
            onChange={(e) => setGoalText(e.target.value)}
            className="h-8"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={!month || !goalText || mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              Сохранить
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
              Отмена
            </Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="ghost" className="w-fit px-1" onClick={() => setAdding(true)}>
          <Plus className="size-3.5" />
          Цель на месяц
        </Button>
      )}
    </div>
  )
}
