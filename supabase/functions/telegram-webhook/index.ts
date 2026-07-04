// Telegram sends updates here. Employees start a personal deep link
// (https://t.me/<bot>?start=<profile_id>) which arrives as "/start <profile_id>";
// we link that chat to their profile so deadline-check can DM them later.
import { createClient } from 'jsr:@supabase/supabase-js@2'

Deno.serve(async (req) => {
  try {
    const update = await req.json()
    const message = update.message
    const text: string | undefined = message?.text
    const chatId: number | undefined = message?.chat?.id

    if (!text || !chatId) return new Response('ok')

    const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN')!
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(supabaseUrl, serviceRoleKey)

    async function reply(msg: string) {
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: msg }),
      })
    }

    const match = text.match(/^\/start\s+([a-f0-9-]{36})$/i)
    if (match) {
      const profileId = match[1]
      const { data: profile, error } = await admin
        .from('profiles')
        .update({ telegram_chat_id: String(chatId) })
        .eq('id', profileId)
        .select('full_name')
        .maybeSingle()
      if (error || !profile) {
        await reply('Не удалось найти сотрудника. Проверьте ссылку у CEO.')
      } else {
        await reply(`Готово, ${profile.full_name}! Теперь вы будете получать уведомления о дедлайнах.`)
      }
    } else {
      await reply('Отправьте персональную ссылку от CEO, чтобы подключить уведомления.')
    }

    return new Response('ok')
  } catch {
    return new Response('ok') // Telegram retries on non-200; always ack.
  }
})
