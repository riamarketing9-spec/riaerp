// Triggered by a Postgres trigger on time_entries (see migration
// 0027_attendance_notify.sql) via pg_net, the instant someone presses Start
// or Stop on their work timer -- not on a schedule, unlike deadline-check.
// Notifies every CEO (org.full_access) in Uzbek so they see in real time who
// came in and who left, without waiting for the 21:00 daily report.
// Auth: x-cron-secret header, same shared-secret pattern as deadline-check
// and daily-report (this call originates from Postgres itself).
import { createClient } from 'jsr:@supabase/supabase-js@2'

const TASHKENT_OFFSET_HOURS = 5

function tashkentTimeStr(iso: string): string {
  const d = new Date(new Date(iso).getTime() + TASHKENT_OFFSET_HOURS * 60 * 60 * 1000)
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / 60000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${hours} soat ${minutes} daqiqa`
}

Deno.serve(async (req) => {
  const cronSecret = req.headers.get('x-cron-secret')
  if (!cronSecret || cronSecret !== Deno.env.get('CRON_SECRET')) {
    return new Response('unauthorized', { status: 401 })
  }

  const { event, profile_id, occurred_at, started_at } = await req.json()

  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN')!
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(supabaseUrl, serviceRoleKey)

  const { data: profile } = await admin.from('profiles').select('full_name').eq('id', profile_id).maybeSingle()
  const name = profile?.full_name ?? 'Xodim'

  const text =
    event === 'start'
      ? `🟢 ${name} ishni boshladi — ${tashkentTimeStr(occurred_at)}`
      : `🔴 ${name} ishni tugatdi — ${tashkentTimeStr(occurred_at)} (${formatDuration(
          new Date(occurred_at).getTime() - new Date(started_at).getTime()
        )})`

  const { data: profiles } = await admin.from('profiles').select('id')

  for (const p of profiles ?? []) {
    const { data: isCeo } = await admin.rpc('has_capability_for_profile', {
      p_profile_id: p.id,
      p_capability: 'org.full_access',
    })
    if (!isCeo) continue
    const { data: links } = await admin.from('profile_telegram_links').select('chat_id').eq('profile_id', p.id)
    for (const link of links ?? []) {
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: link.chat_id, text }),
      })
    }
  }

  return new Response('ok')
})
