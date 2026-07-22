// Fired by pg_cron every day at 16:00 UTC (= 21:00 Asia/Tashkent, no DST) --
// see 0025_daily_report_cron.sql. Sends the overall "work done" report to
// every profile that holds org.full_access (true CEO) and has a linked
// Telegram chat. Auth: x-cron-secret header, same pattern as deadline-check
// (this call originates from Postgres itself, not a logged-in user).
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { buildReport } from '../_shared/report.ts'

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
