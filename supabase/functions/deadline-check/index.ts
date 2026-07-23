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
// responsible. A profile can have several linked Telegram chats (see
// 0028_telegram_multi_link.sql) — every send goes to all of them.
import { createClient } from 'jsr:@supabase/supabase-js@2'

// Asia/Tashkent = UTC+5 year-round (no DST). Deadlines are timestamptz, and
// staff enter them in their own Tashkent wall-clock time -- so "which
// calendar day is this deadline" must bucket by Tashkent's day, not UTC's.
// Getting this wrong shifts every deadline set between Tashkent 00:00-04:59
// (= UTC 19:00-23:59 the previous day) a full day early.
const TASHKENT_OFFSET_HOURS = 5

function dateOnly(d: Date) {
  return new Date(d.getTime() + TASHKENT_OFFSET_HOURS * 60 * 60 * 1000).toISOString().slice(0, 10)
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

  async function getChatIdsForProfile(profileId: string): Promise<string[]> {
    const { data } = await admin.from('profile_telegram_links').select('chat_id').eq('profile_id', profileId)
    return (data ?? []).map((l: { chat_id: string }) => l.chat_id)
  }

  // Sends to every chat linked to this profile; true if at least one went
  // through, so callers only log/count a notification once per profile.
  async function sendToProfile(profileId: string, text: string): Promise<boolean> {
    let anySent = false
    for (const chatId of await getChatIdsForProfile(profileId)) {
      if (await sendTelegram(chatId, text)) anySent = true
    }
    return anySent
  }

  // CEO(s) — recipients for "nobody's on this" nags, same lookup daily-report
  // uses (has_capability_for_profile, since this runs under the service role
  // with no auth.uid() session to call has_capability() directly).
  async function getCeoChatIds(): Promise<string[]> {
    const { data: allProfiles } = await admin.from('profiles').select('id')
    const ids: string[] = []
    for (const p of allProfiles ?? []) {
      const { data: isCeo } = await admin.rpc('has_capability_for_profile', {
        p_profile_id: p.id,
        p_capability: 'org.full_access',
      })
      if (isCeo) ids.push(...(await getChatIdsForProfile(p.id)))
    }
    return ids
  }

  async function getPmChatIds(projectId: string | null): Promise<string[]> {
    if (!projectId) return []
    const { data: project } = await admin.from('projects').select('pm_profile_id').eq('id', projectId).maybeSingle()
    if (!project?.pm_profile_id) return []
    return getChatIdsForProfile(project.pm_profile_id)
  }

  const ceoChatIds = await getCeoChatIds()

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

    const deadlineStr = new Date(task.deadline!).toLocaleDateString('uz-Latn-UZ')
    const text =
      type === 'due_tomorrow'
        ? `⏰ Ertaga muddati tugaydi: "${task.title}" — ${deadlineStr}`
        : type === 'due_today'
          ? `⏰ Bugun muddati tugaydi: "${task.title}" — ${deadlineStr}`
          : `⚠ Muddati o'tgan vazifa: "${task.title}" (muddat ${deadlineStr} edi)`

    if (await sendToProfile(task.assignee_profile_id!, text)) {
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
  // C. Tasks with nobody assigned at all: not date-scoped (a task can miss an
  //    assignee whether or not it even has a deadline), deduped once/day per
  //    task like everything else — nags the CEO plus that project's PM so it
  //    doesn't just sit there silently.
  // =========================================================================
  const { data: unassignedTasks } = await admin
    .from('tasks')
    .select('id, title, project_id')
    .is('assignee_profile_id', null)
    .neq('status_id', doneStatus?.id ?? '')

  for (const task of unassignedTasks ?? []) {
    if (await alreadySentToday({ related_task_id: task.id }, 'no_assignee')) continue

    const recipients = [...new Set([...ceoChatIds, ...(await getPmChatIds(task.project_id))])]
    if (recipients.length === 0) continue

    const text = `⚠️ Vazifaga ijrochi tayinlanmagan: "${task.title}"`
    let anySent = false
    for (const chatId of recipients) {
      if (await sendTelegram(chatId, text)) anySent = true
    }
    if (anySent) {
      sent += 1
      await admin.from('notification_log').insert({
        channel: 'telegram',
        type: 'no_assignee',
        related_task_id: task.id,
        payload_json: { text },
      })
    }
  }

  // =========================================================================
  // D. Content-plan items: T-1 / T-0 reminders on publish_date, to every
  //    tagged person (shooter, editor, responsible) — "за всё где он
  //    отмечен". Items with nobody tagged at all get the same CEO+PM nag as
  //    unassigned tasks, instead of being silently skipped.
  // =========================================================================
  const { data: contentItems } = await admin
    .from('content_plan_items')
    .select('id, topic, publish_date, project_id, shooter_profile_id, editor_profile_id, responsible_profile_id')
    .not('publish_date', 'is', null)
    .in('publish_date', [todayKey, tomorrowKey])

  for (const item of contentItems ?? []) {
    const type = item.publish_date === tomorrowKey ? 'due_tomorrow' : 'due_today'

    const taggedProfileIds = [...new Set(
      [item.shooter_profile_id, item.editor_profile_id, item.responsible_profile_id].filter(
        (id): id is string => !!id
      )
    )]

    if (taggedProfileIds.length === 0) {
      if (await alreadySentToday({ related_content_plan_item_id: item.id }, 'no_assignee')) continue

      const recipients = [...new Set([...ceoChatIds, ...(await getPmChatIds(item.project_id))])]
      if (recipients.length === 0) continue

      const text = `⚠️ Kontent-reja bandiga hech kim tayinlanmagan: "${item.topic}"`
      let anySent = false
      for (const chatId of recipients) {
        if (await sendTelegram(chatId, text)) anySent = true
      }
      if (anySent) {
        sent += 1
        await admin.from('notification_log').insert({
          channel: 'telegram',
          type: 'no_assignee',
          related_content_plan_item_id: item.id,
          payload_json: { text },
        })
      }
      continue
    }

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

      const dateStr = new Date(item.publish_date!).toLocaleDateString('uz-Latn-UZ')
      const text =
        type === 'due_tomorrow'
          ? `⏰ Ertaga chiqish sanasi: "${item.topic}" — ${dateStr}`
          : `⏰ Bugun chiqish sanasi: "${item.topic}" — ${dateStr}`

      if (await sendToProfile(profileId, text)) {
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
