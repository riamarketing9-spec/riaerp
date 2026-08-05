// Runs once daily at 07:00 Tashkent (02:00 UTC, see pg_cron in migration
// 0071) -- exact-interval regeneration for "chek-list" tasks (any task
// with recurrence_id set; recurrence is only ever chosen through the
// checklist's own "+" flow now, not the general TaskSheet). Unlike the
// old on-done-triggered spawn (removed in migration 0070), this fires
// strictly on schedule: whenever a task's age (now - created_at) has
// reached its recurrence interval, the OLD row is deleted and a fresh one
// is created (created_at resets to now, naturally restarting the interval
// clock for next time) -- regardless of whether the old one was ever
// checked off. one_time tasks are never touched.
import { createClient } from 'jsr:@supabase/supabase-js@2'

function intervalElapsed(createdAt: string, slug: string): boolean {
  const created = new Date(createdAt)
  const now = new Date()
  if (slug === 'daily') return now.getTime() - created.getTime() >= 24 * 60 * 60 * 1000
  if (slug === 'weekly') return now.getTime() - created.getTime() >= 7 * 24 * 60 * 60 * 1000
  if (slug === 'monthly') {
    const nextMonth = new Date(created)
    nextMonth.setMonth(nextMonth.getMonth() + 1)
    return now >= nextMonth
  }
  return false
}

Deno.serve(async (req) => {
  const cronSecret = req.headers.get('x-cron-secret')
  if (!cronSecret || cronSecret !== Deno.env.get('CRON_SECRET')) {
    return new Response('unauthorized', { status: 401 })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(supabaseUrl, serviceRoleKey)

  const { data: recurrenceTypes } = await admin.from('recurrence_types').select('id, slug')
  const { data: backlogStatus } = await admin.from('task_statuses').select('id').eq('slug', 'backlog').maybeSingle()
  const backlogId = backlogStatus?.id

  const { data: tasks } = await admin
    .from('tasks')
    .select(
      'id, title, project_id, assignee_profile_id, priority_id, recurrence_id, deliverable_text, content_plan_item_id, created_by, deliverable_type_id, term_type_id, quadrant_id, created_at'
    )
    .not('recurrence_id', 'is', null)

  let regenerated = 0

  for (const task of tasks ?? []) {
    const slug = (recurrenceTypes ?? []).find((r: { id: string }) => r.id === task.recurrence_id)?.slug
    if (!slug || slug === 'one_time') continue
    if (!intervalElapsed(task.created_at, slug)) continue

    const { data: items } = await admin.from('task_items').select('title, sort_order').eq('task_id', task.id)
    const { data: deliverableTypes } = await admin
      .from('task_deliverable_types')
      .select('deliverable_type_id')
      .eq('task_id', task.id)

    const { data: newTask, error: insertErr } = await admin
      .from('tasks')
      .insert({
        title: task.title,
        project_id: task.project_id,
        assignee_profile_id: task.assignee_profile_id,
        status_id: backlogId,
        priority_id: task.priority_id,
        recurrence_id: task.recurrence_id,
        deliverable_text: task.deliverable_text,
        content_plan_item_id: task.content_plan_item_id,
        created_by: task.created_by,
        deliverable_type_id: task.deliverable_type_id,
        term_type_id: task.term_type_id,
        quadrant_id: task.quadrant_id,
      })
      .select('id')
      .single()
    if (insertErr || !newTask) continue

    if (items && items.length > 0) {
      await admin.from('task_items').insert(
        items.map((i: { title: string; sort_order: number }) => ({
          task_id: newTask.id,
          title: i.title,
          is_done: false,
          sort_order: i.sort_order,
        }))
      )
    }
    if (deliverableTypes && deliverableTypes.length > 0) {
      await admin.from('task_deliverable_types').insert(
        deliverableTypes.map((d: { deliverable_type_id: string }) => ({
          task_id: newTask.id,
          deliverable_type_id: d.deliverable_type_id,
        }))
      )
    }

    // Cascades to task_items/task_deliverable_types for the old row.
    await admin.from('tasks').delete().eq('id', task.id)
    regenerated++
  }

  return new Response(JSON.stringify({ ok: true, regenerated }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
