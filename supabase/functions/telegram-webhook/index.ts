// Telegram sends every update here. Two ways to link a chat to a profile:
// 1. Legacy deep link from CEO ("Скопировать ссылку" on the Team page):
//    https://t.me/<bot>?start=<profile_id> arrives as "/start <profile_id>".
// 2. Self-service: the employee sends the email they log into the ERP with;
//    the bot looks it up, asks "is this you?" with an inline confirm button,
//    and links the chat on confirmation.
// Once linked, "📋 Vazifalarim" fetches the employee's own open tasks.
// Hard constraint: this function must never query finance/payroll/KPI
// tables — only tasks/task_statuses/profiles (for a name).
// All bot-facing text is Uzbek only, per the client's requirement.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const TASKS_KEYBOARD = {
  keyboard: [[{ text: '📋 Vazifalarim' }]],
  resize_keyboard: true,
}

Deno.serve(async (req) => {
  try {
    const update = await req.json()
    const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN')!
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(supabaseUrl, serviceRoleKey)

    async function send(chatId: number, text: string, extra?: Record<string, unknown>) {
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, ...extra }),
      })
    }

    async function answerCallback(callbackQueryId: string, text?: string) {
      await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
      })
    }

    async function linkChatAndWelcome(chatId: number, profileId: string, fullName: string) {
      await admin.from('profiles').update({ telegram_chat_id: String(chatId) }).eq('id', profileId)
      await send(
        chatId,
        `Tabriklaymiz, ${fullName}! Endi men sizga muddatlar yaqinlashganda eslatib turaman va "📋 Vazifalarim" tugmasi orqali joriy vazifalaringizni ko'rsataman.`,
        { reply_markup: TASKS_KEYBOARD }
      )
    }

    async function sendMyTasks(chatId: number) {
      const { data: profile } = await admin
        .from('profiles')
        .select('id, full_name')
        .eq('telegram_chat_id', String(chatId))
        .maybeSingle()

      if (!profile) {
        await send(chatId, "Sizning profilingiz hali ulanmagan. Avval tizimga kirish uchun ishlatadigan emailingizni yuboring.")
        return
      }

      const { data: doneStatus } = await admin.from('task_statuses').select('id').eq('slug', 'done').maybeSingle()

      let query = admin
        .from('tasks')
        .select('title, deadline')
        .eq('assignee_profile_id', profile.id)
        .order('deadline', { ascending: true, nullsFirst: false })

      if (doneStatus) query = query.neq('status_id', doneStatus.id)

      const { data: tasks } = await query

      if (!tasks || tasks.length === 0) {
        await send(chatId, "Hozircha faol vazifalaringiz yo'q. 🎉")
        return
      }

      const lines = tasks.map((t) => {
        const deadline = t.deadline
          ? new Date(t.deadline).toLocaleDateString('uz-Latn-UZ', { day: '2-digit', month: '2-digit', year: 'numeric' })
          : "muddatsiz"
        return `• ${t.title} — ${deadline}`
      })
      await send(chatId, `Sizning faol vazifalaringiz:\n\n${lines.join('\n')}`)
    }

    // --- Inline button press (email-match confirmation) ---
    const callbackQuery = update.callback_query
    if (callbackQuery) {
      const chatId: number = callbackQuery.message.chat.id
      const data: string = callbackQuery.data ?? ''

      if (data.startsWith('confirm_link:')) {
        const profileId = data.slice('confirm_link:'.length)
        const { data: profile } = await admin.from('profiles').select('full_name').eq('id', profileId).maybeSingle()
        await answerCallback(callbackQuery.id)
        if (profile) {
          await linkChatAndWelcome(chatId, profileId, profile.full_name)
        } else {
          await send(chatId, "Xatolik yuz berdi, iltimos emailingizni qaytadan yuboring.")
        }
      } else if (data === 'cancel_link') {
        await answerCallback(callbackQuery.id)
        await send(chatId, 'Yaxshi, tizimga kirish uchun ishlatadigan to\'g\'ri emailingizni yuboring.')
      } else {
        await answerCallback(callbackQuery.id)
      }
      return new Response('ok')
    }

    // --- Regular message ---
    const message = update.message
    const text: string | undefined = message?.text
    const chatId: number | undefined = message?.chat?.id
    if (!text || !chatId) return new Response('ok')

    // Legacy deep link from the CEO's "copy link" button.
    const deepLinkMatch = text.match(/^\/start\s+([a-f0-9-]{36})$/i)
    if (deepLinkMatch) {
      const profileId = deepLinkMatch[1]
      const { data: profile } = await admin.from('profiles').select('full_name').eq('id', profileId).maybeSingle()
      if (!profile) {
        await send(chatId, "Xodim topilmadi. Havolani CEO'dan qaytadan so'rang.")
      } else {
        await linkChatAndWelcome(chatId, profileId, profile.full_name)
      }
      return new Response('ok')
    }

    if (text === '📋 Vazifalarim' || text === '/tasks') {
      await sendMyTasks(chatId)
      return new Response('ok')
    }

    if (text === '/start') {
      await send(chatId, "Assalomu alaykum! Tizimga ulanish uchun login qiladigan emailingizni yuboring.")
      return new Response('ok')
    }

    // Anything else that looks like an email — try to match a profile.
    const emailMatch = text.trim().match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)
    if (emailMatch) {
      const email = text.trim().toLowerCase()
      const { data: usersPage } = await admin.auth.admin.listUsers()
      const authUser = usersPage?.users.find((u) => u.email?.toLowerCase() === email)

      if (!authUser) {
        await send(chatId, "Bu email bilan xodim topilmadi. Emailni tekshirib, qaytadan yuboring.")
        return new Response('ok')
      }

      const { data: profile } = await admin
        .from('profiles')
        .select('id, full_name, role_id')
        .eq('auth_user_id', authUser.id)
        .maybeSingle()

      if (!profile) {
        await send(chatId, "Bu email bilan xodim topilmadi. Emailni tekshirib, qaytadan yuboring.")
        return new Response('ok')
      }

      const { data: role } = await admin.from('roles').select('label_uz').eq('id', profile.role_id).maybeSingle()

      await send(chatId, `Siz ${profile.full_name} (${role?.label_uz ?? ''}) misiz?`, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: 'Ha, bu men', callback_data: `confirm_link:${profile.id}` },
              { text: "Yo'q", callback_data: 'cancel_link' },
            ],
          ],
        },
      })
      return new Response('ok')
    }

    await send(chatId, "Tizimga ulanish uchun login qiladigan emailingizni yuboring.")
    return new Response('ok')
  } catch {
    return new Response('ok') // Telegram retries on non-200; always ack.
  }
})
