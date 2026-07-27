// Triggered by a Postgres trigger on `tasks` (see migrations
// 0036/0037_task_assignment_notify*.sql) via pg_net, whenever a task's
// assignee_profile_id is set on insert or changed on update through the web
// app -- the bot's own task-creation flow already DMs the assignee itself
// (createTaskFromBot in telegram-webhook), so the trigger skips
// created_via_telegram rows and this function only ever fires for
// web-assigned tasks. Auth: x-cron-secret header, same shared-secret
// pattern as deadline-check/daily-report/attendance-notify.
import { createClient } from 'jsr:@supabase/supabase-js@2'

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

Deno.serve(async (req) => {
  const cronSecret = req.headers.get('x-cron-secret')
  if (!cronSecret || cronSecret !== Deno.env.get('CRON_SECRET')) {
    return new Response('unauthorized', { status: 401 })
  }

  const { task_id, assignee_profile_id, title, deadline, project_id, created_by } = await req.json()

  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN')!
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(supabaseUrl, serviceRoleKey)

  const { data: links } = await admin
    .from('profile_telegram_links')
    .select('chat_id')
    .eq('profile_id', assignee_profile_id)

  if (!links || links.length === 0) return new Response('ok')

  const [{ data: project }, { data: creator }] = await Promise.all([
    project_id
      ? admin.from('projects').select('name').eq('id', project_id).maybeSingle()
      : Promise.resolve({ data: null }),
    created_by
      ? admin.from('profiles').select('full_name').eq('id', created_by).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  // The client attaches deliverable types ("ish turi") in a second query
  // right after inserting the task itself, so they may not exist yet the
  // instant this trigger fires -- give that a moment to land before reading.
  await new Promise((resolve) => setTimeout(resolve, 1500))
  const { data: deliverableRows } = await admin
    .from('task_deliverable_types')
    .select('deliverable_types(label_uz)')
    .eq('task_id', task_id)
  const deliverableText = (deliverableRows ?? [])
    .map((r: { deliverable_types: { label_uz: string } | null }) => r.deliverable_types?.label_uz)
    .filter((v): v is string => !!v)
    .join(', ')

  const deadlineText = deadline
    ? new Date(deadline).toLocaleDateString('uz-Latn-UZ', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : 'muddatsiz'

  const lines = [
    '📌 Sizga yangi vazifa tayinlandi',
    '',
    `<b>${escapeHtml(title)}</b>`,
    project?.name ? `Loyiha: ${escapeHtml(project.name)}` : null,
    `Muddat: ${deadlineText}`,
    deliverableText ? `Ish turi: ${escapeHtml(deliverableText)}` : null,
    creator?.full_name ? `Tayinladi: ${escapeHtml(creator.full_name)}` : null,
    '',
    'Tizimga kirib tekshiring.',
  ].filter((line): line is string => line !== null)

  const text = lines.join('\n')

  for (const link of links) {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: link.chat_id, text, parse_mode: 'HTML' }),
    })
  }

  return new Response('ok')
})
