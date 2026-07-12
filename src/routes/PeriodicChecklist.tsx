import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/auth/AuthProvider'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { pickLabel } from '@/lib/localizedLabel'

function periodKey(cadenceSlug: 'daily' | 'weekly' | 'monthly') {
  const now = new Date()
  if (cadenceSlug === 'daily') return now.toISOString().slice(0, 10)
  if (cadenceSlug === 'monthly') {
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  }
  // weekly: Monday of the current ISO week
  const day = now.getDay() || 7
  const monday = new Date(now)
  monday.setDate(now.getDate() - day + 1)
  return monday.toISOString().slice(0, 10)
}

export function PeriodicChecklist({
  cadenceSlug,
  title,
}: {
  cadenceSlug: 'daily' | 'weekly' | 'monthly'
  title: string
}) {
  const { profile } = useAuth()
  const { i18n } = useTranslation()
  const queryClient = useQueryClient()
  const periodDate = periodKey(cadenceSlug)
  const queryKey = ['periodic-checklist', cadenceSlug, profile?.id, periodDate, i18n.language]

  const { data: instance, isLoading } = useQuery({
    queryKey,
    enabled: !!profile,
    queryFn: async () => {
      const { data: cadence } = await supabase
        .from('checklist_cadences')
        .select('id')
        .eq('slug', cadenceSlug)
        .single()
      if (!cadence) return null

      const { data: template } = await supabase
        .from('checklist_templates')
        .select('id')
        .eq('applies_to_all', true)
        .eq('cadence_id', cadence.id)
        .single()
      if (!template) return null

      const { data: templateItems } = await supabase
        .from('checklist_template_items')
        .select('id, label_ru, label_uz, sort_order')
        .eq('template_id', template.id)
        .order('sort_order')

      const { data: existingRows, error: existingErr } = await supabase
        .from('checklist_instances')
        .select('id')
        .eq('template_id', template.id)
        .eq('profile_id', profile!.id)
        .eq('period_date', periodDate)
        .limit(1)
      if (existingErr) throw existingErr

      let instanceId = existingRows?.[0]?.id

      if (!instanceId) {
        const { data: created, error: createErr } = await supabase
          .from('checklist_instances')
          .insert({ template_id: template.id, profile_id: profile!.id, period_date: periodDate })
          .select('id')
          .limit(1)
        if (createErr) throw createErr
        instanceId = created?.[0]?.id
        if (!instanceId) throw new Error('Failed to create checklist instance')

        if (templateItems?.length) {
          await supabase.from('checklist_instance_items').insert(
            templateItems.map((item) => ({ instance_id: instanceId, template_item_id: item.id }))
          )
        }
      }

      const { data: instanceItems, error: itemsErr } = await supabase
        .from('checklist_instance_items')
        .select('id, template_item_id, is_checked, note')
        .eq('instance_id', instanceId)
      if (itemsErr) throw itemsErr

      return {
        instanceId,
        items: (instanceItems ?? [])
          .map((ii) => {
            const ti = templateItems?.find((t) => t.id === ii.template_item_id)
            return {
              id: ii.id,
              label: pickLabel(ti, i18n.language) ?? '',
              sortOrder: ti?.sort_order ?? 0,
              isChecked: ii.is_checked,
            }
          })
          .sort((a, b) => a.sortOrder - b.sortOrder),
      }
    },
  })

  const toggle = useMutation({
    mutationFn: async ({ id, isChecked }: { id: string; isChecked: boolean }) => {
      const { error } = await supabase
        .from('checklist_instance_items')
        .update({ is_checked: isChecked })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey })
    },
  })

  if (isLoading || !instance) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2.5">
        {instance.items.map((item) => (
          <div key={item.id} className="flex items-center gap-2">
            <Checkbox
              id={item.id}
              checked={item.isChecked}
              onCheckedChange={(checked) =>
                toggle.mutate({ id: item.id, isChecked: checked === true })
              }
            />
            <Label htmlFor={item.id} className="font-normal">
              {item.label}
            </Label>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
