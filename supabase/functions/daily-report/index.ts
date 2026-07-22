// Fired by pg_cron every day at 16:00 UTC (= 21:00 Asia/Tashkent, no DST) --
// see 0025_daily_report_cron.sql. Sends the overall "work done" report to
// every profile that holds org.full_access (true CEO) and has a linked
// Telegram chat. Auth: x-cron-secret header, same pattern as deadline-check
// (this call originates from Postgres itself, not a logged-in user).
import { createClient } from 'jsr:@supabase/supabase-js@2'

// deno-lint-ignore no-explicit-any
async function buildReport(admin: any, profileId?: string): Promise<string> {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data: doneStatus } = await admin.from('task_statuses').select('id').eq('slug', 'done').maybeSingle()

  async function workedMsToday(pid: string): Promise<number> {
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const { data: entries } = await admin
      .from('time_entries')
      .select('started_at, ended_at')
      .eq('profile_id', pid)
      .gte('started_at', todayStart.toISOString())
    let total = 0
    for (const e of entries ?? []) {
      const start = new Date(e.started_at).getTime()
      const end = e.ended_at ? new Date(e.ended_at).getTime() : Date.now()
      total += end - start
    }
    return total
  }

  function formatDuration(ms: number): string {
    const totalMinutes = Math.floor(ms / 60000)
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60
    return `${hours} soat ${minutes} daqiqa`
  }

  if (profileId) {
    const { data: profile } = await admin.from('profiles').select('full_name').eq('id', profileId).maybeSingle()
    if (!profile) return "Xodim topilmadi."

    let completedQuery = admin
      .from('tasks')
      .select('title', { count: 'exact' })
      .eq('assignee_profile_id', profileId)
      .gte('completed_at', dayAgo)
    if (doneStatus) completedQuery = completedQuery.eq('status_id', doneStatus.id)
    const { data: completed } = await completedQuery

    const { data: openTasks } = await admin
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('assignee_profile_id', profileId)
      .neq('status_id', doneStatus?.id ?? '00000000-0000-0000-0000-000000000000')

    const workedMs = await workedMsToday(profileId)

    return (
      `📊 ${profile.full_name} bo'yicha hisobot (so'nggi 24 soat):\n\n` +
      `✅ Bajarilgan vazifalar: ${completed?.length ?? 0}\n` +
      // deno-lint-ignore no-explicit-any
      `📋 Ochiq vazifalar: ${(openTasks as any)?.length ?? (openTasks as any)?.count ?? 0}\n` +
      `⏱ Bugun ishlagan vaqti: ${formatDuration(workedMs)}`
    )
  }

  const { data: profiles } = await admin.from('profiles').select('id, full_name')
  const lines: string[] = []
  for (const p of profiles ?? []) {
    let completedQuery = admin
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('assignee_profile_id', p.id)
      .gte('completed_at', dayAgo)
    if (doneStatus) completedQuery = completedQuery.eq('status_id', doneStatus.id)
    const { count: completedCount } = await completedQuery
    const workedMs = await workedMsToday(p.id)
    if ((completedCount ?? 0) === 0 && workedMs === 0) continue
    lines.push(`• ${p.full_name}: ${completedCount ?? 0} ta vazifa bajarildi, ${formatDuration(workedMs)} ishladi`)
  }

  if (lines.length === 0) return "📊 Umumiy hisobot (so'nggi 24 soat):\n\nHozircha faoliyat yo'q."
  return `📊 Umumiy hisobot (so'nggi 24 soat):\n\n${lines.join('\n')}`
}

Deno.serve(async (req) => {
  try {
    const cronSecret = req.headers.get('x-cron-secret')
    if (!cronSecret || cronSecret !== Deno.env.get('CRON_SECRET')) {
      return new Response('unauthorized', { status: 401 })
    }

    const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN')!
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(supabaseUrl, serviceRoleKey)

    const { data: profiles } = await admin
      .from('profiles')
      .select('id, telegram_chat_id')
      .not('telegram_chat_id', 'is', null)

    const ceoChatIds: number[] = []
    for (const p of profiles ?? []) {
      const { data: isCeo } = await admin.rpc('has_capability_for_profile', {
        p_profile_id: p.id,
        p_capability: 'org.full_access',
      })
      if (isCeo) ceoChatIds.push(Number(p.telegram_chat_id))
    }

    if (ceoChatIds.length === 0) return new Response('ok')

    const report = await buildReport(admin)

    for (const chatId of ceoChatIds) {
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: `🕘 Kunlik hisobot (21:00):\n\n${report}` }),
      })
    }

    return new Response('ok')
  } catch {
    return new Response('ok')
  }
})
