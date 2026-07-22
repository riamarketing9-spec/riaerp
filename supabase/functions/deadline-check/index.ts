// Scheduled by pg_cron (see migration 0006) via pg_net HTTP POST, authenticated
// by a shared secret header (not a user JWT — this is a system job, deployed
// with --no-verify-jwt). Runs entirely on Supabase's own Postgres/Edge
// infrastructure every 30 minutes — independent of whether anyone's
// computer is on.
//
// Reminds, per the client's explicit spec: exactly 1 day before the
// deadline, and again on the day of the deadline itself. Two separate
// buckets ('due_tomorrow' / 'due_today'), each deduped once per day per
// task/item so re-running every 30 minutes doesn't spam the same person.
// Also keeps the pre-existing daily "missed deadline" nudge for tasks that
// are overdue and still not done.
//
// Covers everything a person is tagged on ("за всё где он отмечен"), not
// just their own tasks: task assignee, and content-plan shooter/editor/
// responsible.
import { createClient } from 'jsr:@supabase/supabase-js@2'

function dateOnly(d: Date) {
  return d.toISOString().slice(0, 10)
}

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
  const todayKey = dateOnly(now)
  const tomorrowKey = dateOnly(new Date(now.getTime() + 24 * 60 * 60 * 1000))

  let sent = 0

  // Already-notified-today check, scoped by (task|item) + type, so
  // 'due_tomorrow' and 'due_today' are independent even for the same task.
  async function alreadySentToday(filter: { related_task_id?: string; related_content_plan_item_id?: string }, type: string) {
    let query = admin
      .from('notification_log')
      .select('id')
      .eq('type', type)
      .gte('sent_at', `${todayKey}T00:00:00Z`)
    if (filter.related_task_id) query = query.eq('related_task_id', filter.related_task_id)
    if (filter.related_content_plan_item_id) query = query.eq('related_content_plan_item_id', filter.related_content_plan_item_id)
    const { data } = await query.limit(1)
    return !!data && data.length > 0
  }

  async function sendTelegram(chatId: string, text: string) {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    })
    return res.ok
  }

  // =========================================================================
  // A. Tasks: T-1 / T-0 reminders + daily "still overdue" nudge, to the
  //    assignee.
  // =========================================================================
  const { data: doneStatus } = await admin.from('task_statuses').select('id').eq('slug', 'done').single()

  const { data: tasks } = await admin
    .from('tasks')
    .select('id, title, deadline, assignee_profile_id, status_id')
    .not('deadline', 'is', null)
    .not('assignee_profile_id', 'is', null)
    .neq('status_id', doneStatus?.id ?? '')

  for (const task of tasks ?? []) {
    const deadlineKey = dateOnly(new Date(task.deadline!))
    let type: string | null = null
    if (deadlineKey === tomorrowKey) type = 'due_tomorrow'
    else if (deadlineKey === todayKey) type = 'due_today'
    else if (new Date(task.deadline!) < now) type = 'missed_deadline'
    if (!type) continue

    if (await alreadySentToday({ related_task_id: task.id }, type)) continue

    const { data: profile } = await admin
      .from('profiles')
      .select('telegram_chat_id')
      .eq('id', task.assignee_profile_id)
      .single()
    if (!profile?.telegram_chat_id) continue

    const deadlineStr = new Date(task.deadline!).toLocaleDateString('uz-Latn-UZ')
    const text =
      type === 'due_tomorrow'
        ? `⏰ Ertaga muddati tugaydi: "${task.title}" — ${deadlineStr}`
        : type === 'due_today'
          ? `⏰ Bugun muddati tugaydi: "${task.title}" — ${deadlineStr}`
          : `⚠ Muddati o'tgan vazifa: "${task.title}" (muddat ${deadlineStr} edi)`

    if (await sendTelegram(profile.telegram_chat_id, text)) {
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

  // =========================================================================
  // B. Content-plan items: T-1 / T-0 reminders on publish_date, to every
  //    tagged person (shooter, editor, responsible) — "за всё где он
  //    отмечен".
  // =========================================================================
  const { data: contentItems } = await admin
    .from('content_plan_items')
    .select('id, topic, publish_date, shooter_profile_id, editor_profile_id, responsible_profile_id')
    .not('publish_date', 'is', null)
    .in('publish_date', [todayKey, tomorrowKey])

  for (const item of contentItems ?? []) {
    const type = item.publish_date === tomorrowKey ? 'due_tomorrow' : 'due_today'

    const taggedProfileIds = [...new Set(
      [item.shooter_profile_id, item.editor_profile_id, item.responsible_profile_id].filter(
        (id): id is string => !!id
      )
    )]
    if (taggedProfileIds.length === 0) continue

    for (const profileId of taggedProfileIds) {
      // Dedup per (item, type) covers all tagged people together — a single
      // insert marks it sent, matching the once-per-day intent used for tasks.
      const { data: already } = await admin
        .from('notification_log')
        .select('id')
        .eq('type', type)
        .eq('related_content_plan_item_id', item.id)
        .eq('profile_id', profileId)
        .gte('sent_at', `${todayKey}T00:00:00Z`)
        .limit(1)
      if (already && already.length > 0) continue

      const { data: profile } = await admin.from('profiles').select('telegram_chat_id').eq('id', profileId).single()
      if (!profile?.telegram_chat_id) continue

      const dateStr = new Date(item.publish_date!).toLocaleDateString('uz-Latn-UZ')
      const text =
        type === 'due_tomorrow'
          ? `⏰ Ertaga chiqish sanasi: "${item.topic}" — ${dateStr}`
          : `⏰ Bugun chiqish sanasi: "${item.topic}" — ${dateStr}`

      if (await sendTelegram(profile.telegram_chat_id, text)) {
        sent += 1
        await admin.from('notification_log').insert({
          profile_id: profileId,
          channel: 'telegram',
          type,
          related_content_plan_item_id: item.id,
          payload_json: { text },
        })
      }
    }
  }

  return new Response(JSON.stringify({ tasksChecked: tasks?.length ?? 0, itemsChecked: contentItems?.length ?? 0, sent }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
