// Scheduled by pg_cron (see migration 0006) via pg_net HTTP POST, authenticated
// by a shared secret header (not a user JWT — this is a system job, deployed
// with --no-verify-jwt). Finds tasks due within 3 days or overdue, DMs the
// assignee on Telegram (if linked), and logs to notification_log so we never
// send the same reminder twice for the same task+day.
import { createClient } from 'jsr:@supabase/supabase-js@2'

Deno.serve(async (req) => {
  const cronSecret = Deno.env.get('CRON_SECRET')
  if (req.headers.get('x-cron-secret') !== cronSecret) {
    return new Response('forbidden', { status: 403 })
  }

  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN')!
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(supabaseUrl, serviceRoleKey)

  const now = new Date()
  const soon = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)

  const { data: doneStatus } = await admin
    .from('task_statuses')
    .select('id')
    .eq('slug', 'done')
    .single()

  const { data: tasks, error } = await admin
    .from('tasks')
    .select('id, title, deadline, assignee_profile_id, status_id')
    .not('deadline', 'is', null)
    .lte('deadline', soon.toISOString())
    .neq('status_id', doneStatus?.id ?? '')
    .not('assignee_profile_id', 'is', null)

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  let sent = 0
  const todayKey = now.toISOString().slice(0, 10)

  for (const task of tasks ?? []) {
    const type = new Date(task.deadline!) < now ? 'missed_deadline' : 'deadline_reminder'

    // Skip if we already notified about this task today (any type).
    const { data: already } = await admin
      .from('notification_log')
      .select('id')
      .eq('related_task_id', task.id)
      .gte('sent_at', `${todayKey}T00:00:00Z`)
      .limit(1)
    if (already && already.length > 0) continue

    const { data: profile } = await admin
      .from('profiles')
      .select('telegram_chat_id, full_name')
      .eq('id', task.assignee_profile_id)
      .single()

    if (!profile?.telegram_chat_id) continue

    const deadlineStr = new Date(task.deadline!).toLocaleDateString('ru-RU')
    const text =
      type === 'missed_deadline'
        ? `⚠ Просрочена задача: "${task.title}" (дедлайн был ${deadlineStr})`
        : `⏰ Дедлайн приближается: "${task.title}" — ${deadlineStr}`

    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: profile.telegram_chat_id, text }),
    })

    if (res.ok) {
      sent += 1
      await admin.from('notification_log').insert({
        profile_id: task.assignee_profile_id,
        channel: 'telegram',
        type,
        related_task_id: task.id,
        payload_json: { text },
      })
    }
  }

  return new Response(JSON.stringify({ checked: tasks?.length ?? 0, sent }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
