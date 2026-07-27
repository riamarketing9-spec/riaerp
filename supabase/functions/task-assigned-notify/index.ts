// Triggered by a Postgres trigger on `tasks` (see migration
// 0036_task_assignment_notify.sql) via pg_net, whenever a task's
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

  const { assignee_profile_id, title, deadline } = await req.json()

  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN')!
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(supabaseUrl, serviceRoleKey)

  const { data: links } = await admin
    .from('profile_telegram_links')
    .select('chat_id')
    .eq('profile_id', assignee_profile_id)

  if (!links || links.length === 0) return new Response('ok')

  const deadlineText = deadline
    ? new Date(deadline).toLocaleDateString('uz-Latn-UZ', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : 'muddatsiz'

  const text = `📌 Sizga yangi vazifa tayinlandi:\n\n<b>${escapeHtml(title)}</b>\nMuddat: ${deadlineText}\n\nTizimga kirib tekshiring.`

  for (const link of links) {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: link.chat_id, text, parse_mode: 'HTML' }),
    })
  }

  return new Response('ok')
})
