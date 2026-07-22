// Telegram sends every update here. Two ways to link a chat to a profile:
// 1. Legacy deep link from CEO ("Скопировать ссылку" on the Team page):
//    https://t.me/<bot>?start=<profile_id> arrives as "/start <profile_id>".
// 2. Self-service: the employee sends the email they log into the ERP with;
//    the bot looks it up, asks "is this you?" with an inline confirm button,
//    and links the chat on confirmation.
// Once linked, "📋 Vazifalarim" fetches the employee's own open tasks.
//
// CEO-only extras (checked via has_capability_for_profile('org.full_access'),
// since this function runs under the service role with no auth.uid()):
// - "➕ Vazifa berish": pick an employee -> type a task -> pick a deadline ->
//   creates a real row in `tasks` (created_via_telegram = true) and pings
//   the assignee on Telegram.
// - "📊 Hisobot": on-demand work-done report, overall or per employee (the
//   same report also gets pushed automatically at 21:00 Tashkent time by the
//   daily-report function/cron -- see 0025_daily_report_cron.sql).
// Each Telegram update is an independent HTTP call, so multi-step flows
// (assign task, pick deadline) are tracked in `bot_conversation_state`,
// keyed by chat_id.
//
// Hard constraint: this function must never query finance/payroll/KPI
// tables -- only tasks/task_statuses/profiles/time_entries.
// All bot-facing text is Uzbek only, per the client's requirement.
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

const TASKS_KEYBOARD = {
  keyboard: [[{ text: '📋 Vazifalarim' }]],
  resize_keyboard: true,
}

const CEO_KEYBOARD = {
  keyboard: [[{ text: '📋 Vazifalarim' }], [{ text: '➕ Vazifa berish' }], [{ text: '📊 Hisobot' }]],
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

    async function getLinkedProfile(chatId: number) {
      const { data } = await admin
        .from('profiles')
        .select('id, full_name, role_id')
        .eq('telegram_chat_id', String(chatId))
        .maybeSingle()
      return data
    }

    async function isCeoProfile(profileId: string) {
      const { data } = await admin.rpc('has_capability_for_profile', {
        p_profile_id: profileId,
        p_capability: 'org.full_access',
      })
      return !!data
    }

    async function keyboardFor(chatId: number) {
      const profile = await getLinkedProfile(chatId)
      if (profile && (await isCeoProfile(profile.id))) return CEO_KEYBOARD
      return TASKS_KEYBOARD
    }

    async function setState(chatId: number, state: string, payload: Record<string, unknown>) {
      await admin
        .from('bot_conversation_state')
        .upsert({ chat_id: chatId, state, payload, updated_at: new Date().toISOString() })
    }

    async function clearState(chatId: number) {
      await admin.from('bot_conversation_state').delete().eq('chat_id', chatId)
    }

    async function getState(chatId: number) {
      const { data } = await admin
        .from('bot_conversation_state')
        .select('state, payload')
        .eq('chat_id', chatId)
        .maybeSingle()
      return data as { state: string; payload: Record<string, string> } | null
    }

    async function linkChatAndWelcome(chatId: number, profileId: string, fullName: string) {
      await admin.from('profiles').update({ telegram_chat_id: String(chatId) }).eq('id', profileId)
      await send(
        chatId,
        `Tabriklaymiz, ${fullName}! Endi men sizga muddatlar yaqinlashganda eslatib turaman va "📋 Vazifalarim" tugmasi orqali joriy vazifalaringizni ko'rsataman.`,
        { reply_markup: await keyboardFor(chatId) }
      )
    }

    async function sendMyTasks(chatId: number) {
      const profile = await getLinkedProfile(chatId)

      if (!profile) {
        await send(chatId, "Sizning profilingiz hali ulanmagan. Avval tizimga kirish uchun ishlatadigan emailingizni yuboring.")
        return
      }

      const { data: doneStatus } = await admin.from('task_statuses').select('id').eq('slug', 'done').maybeSingle()

      let query = admin
        .from('tasks')
        .select('title, deadline, created_via_telegram')
        .eq('assignee_profile_id', profile.id)
        .order('deadline', { ascending: true, nullsFirst: false })

      if (doneStatus) query = query.neq('status_id', doneStatus.id)

      const { data: tasks } = await query

      if (!tasks || tasks.length === 0) {
        await send(chatId, "Hozircha faol vazifalaringiz yo'q. 🎉")
        return
      }

      const lines = tasks.map((t: { title: string; deadline: string | null; created_via_telegram: boolean }) => {
        const deadline = t.deadline
          ? new Date(t.deadline).toLocaleDateString('uz-Latn-UZ', { day: '2-digit', month: '2-digit', year: 'numeric' })
          : "muddatsiz"
        const botTag = t.created_via_telegram ? ' [bot]' : ''
        return `• ${t.title}${botTag} — ${deadline}`
      })
      await send(chatId, `Sizning faol vazifalaringiz:\n\n${lines.join('\n')}`)
    }

    async function startAssignFlow(chatId: number) {
      const { data: profiles } = await admin
        .from('profiles')
        .select('id, full_name, staff_statuses(slug)')
        .order('full_name')
      // deno-lint-ignore no-explicit-any
      const active = (profiles ?? []).filter((p: any) => p.staff_statuses?.slug !== 'inactive')

      if (active.length === 0) {
        await send(chatId, "Xodimlar topilmadi.")
        return
      }

      await send(chatId, "Vazifani kimga berasiz?", {
        reply_markup: {
          inline_keyboard: active.map((p: { id: string; full_name: string }) => [
            { text: p.full_name, callback_data: `assign_emp:${p.id}` },
          ]),
        },
      })
    }

    function deadlineKeyboard() {
      return {
        inline_keyboard: [
          [
            { text: 'Bugun', callback_data: 'deadline:0' },
            { text: 'Ertaga', callback_data: 'deadline:1' },
          ],
          [
            { text: '3 kundan keyin', callback_data: 'deadline:3' },
            { text: '1 haftadan keyin', callback_data: 'deadline:7' },
          ],
          [{ text: "📅 Boshqa sana", callback_data: 'deadline_manual' }],
        ],
      }
    }

    async function createTaskFromBot(chatId: number, assigneeProfileId: string, title: string, deadline: Date | null) {
      const ceoProfile = await getLinkedProfile(chatId)
      const { data: newStatus } = await admin.from('task_statuses').select('id').eq('slug', 'backlog').maybeSingle()

      const { error } = await admin.from('tasks').insert({
        title,
        assignee_profile_id: assigneeProfileId,
        status_id: newStatus?.id,
        deadline: deadline ? deadline.toISOString() : null,
        created_by: ceoProfile?.id ?? null,
        created_via_telegram: true,
      })

      if (error) {
        await send(chatId, "Xatolik yuz berdi, vazifa yaratilmadi.")
        return
      }

      await send(chatId, "✅ Vazifa yaratildi va tizimda ko'rinadi.", { reply_markup: await keyboardFor(chatId) })

      const { data: assignee } = await admin
        .from('profiles')
        .select('telegram_chat_id')
        .eq('id', assigneeProfileId)
        .maybeSingle()

      if (assignee?.telegram_chat_id) {
        const deadlineText = deadline
          ? deadline.toLocaleDateString('uz-Latn-UZ', { day: '2-digit', month: '2-digit', year: 'numeric' })
          : "muddatsiz"
        await send(
          Number(assignee.telegram_chat_id),
          `📌 CEO sizga yangi vazifa berdi:\n\n«${title}»\nMuddat: ${deadlineText}\n\nTizimga kirib tekshiring.`
        )
      }
    }

    async function sendReportPicker(chatId: number) {
      await send(chatId, "Hisobot turi:", {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Umumiy', callback_data: 'report_all' }],
            [{ text: "Xodim bo'yicha", callback_data: 'report_pick' }],
          ],
        },
      })
    }

    async function sendEmployeeReportPicker(chatId: number) {
      const { data: profiles } = await admin.from('profiles').select('id, full_name').order('full_name')
      await send(chatId, "Qaysi xodim bo'yicha?", {
        reply_markup: {
          inline_keyboard: (profiles ?? []).map((p: { id: string; full_name: string }) => [
            { text: p.full_name, callback_data: `report_emp:${p.id}` },
          ]),
        },
      })
    }

    // --- Inline button press ---
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
      } else if (data.startsWith('assign_emp:')) {
        await answerCallback(callbackQuery.id)
        const profile = await getLinkedProfile(chatId)
        if (!profile || !(await isCeoProfile(profile.id))) {
          await send(chatId, "Bu funksiya faqat CEO uchun.")
          return new Response('ok')
        }
        const assigneeProfileId = data.slice('assign_emp:'.length)
        await setState(chatId, 'awaiting_task_text', { assignee_profile_id: assigneeProfileId })
        await send(chatId, "Vazifa matnini yuboring:")
      } else if (data.startsWith('deadline:')) {
        await answerCallback(callbackQuery.id)
        const state = await getState(chatId)
        if (!state || state.state !== 'awaiting_deadline') return new Response('ok')
        const days = Number(data.slice('deadline:'.length))
        const deadline = new Date()
        deadline.setHours(23, 59, 0, 0)
        deadline.setDate(deadline.getDate() + days)
        await clearState(chatId)
        await createTaskFromBot(chatId, state.payload.assignee_profile_id, state.payload.title, deadline)
      } else if (data === 'deadline_manual') {
        await answerCallback(callbackQuery.id)
        const state = await getState(chatId)
        if (!state || state.state !== 'awaiting_deadline') return new Response('ok')
        await setState(chatId, 'awaiting_deadline_manual', state.payload)
        await send(chatId, "Muddatni KK.OO.YYYY formatida yuboring (masalan: 25.12.2026):")
      } else if (data === 'report_all') {
        await answerCallback(callbackQuery.id)
        const profile = await getLinkedProfile(chatId)
        if (!profile || !(await isCeoProfile(profile.id))) return new Response('ok')
        await send(chatId, await buildReport(admin))
      } else if (data === 'report_pick') {
        await answerCallback(callbackQuery.id)
        const profile = await getLinkedProfile(chatId)
        if (!profile || !(await isCeoProfile(profile.id))) return new Response('ok')
        await sendEmployeeReportPicker(chatId)
      } else if (data.startsWith('report_emp:')) {
        await answerCallback(callbackQuery.id)
        const profile = await getLinkedProfile(chatId)
        if (!profile || !(await isCeoProfile(profile.id))) return new Response('ok')
        const targetId = data.slice('report_emp:'.length)
        await send(chatId, await buildReport(admin, targetId))
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

    // --- Multi-step conversation state takes priority over everything else ---
    const state = await getState(chatId)
    if (state?.state === 'awaiting_task_text') {
      await setState(chatId, 'awaiting_deadline', { ...state.payload, title: text.trim() })
      await send(chatId, "Muddatni tanlang:", { reply_markup: deadlineKeyboard() })
      return new Response('ok')
    }
    if (state?.state === 'awaiting_deadline_manual') {
      const match = text.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
      if (!match) {
        await send(chatId, "Format noto'g'ri. KK.OO.YYYY ko'rinishida yuboring (masalan: 25.12.2026):")
        return new Response('ok')
      }
      const [, day, month, year] = match
      const deadline = new Date(Number(year), Number(month) - 1, Number(day), 23, 59, 0)
      await clearState(chatId)
      await createTaskFromBot(chatId, state.payload.assignee_profile_id, state.payload.title, deadline)
      return new Response('ok')
    }

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

    if (text === '➕ Vazifa berish') {
      const profile = await getLinkedProfile(chatId)
      if (!profile || !(await isCeoProfile(profile.id))) {
        await send(chatId, "Bu funksiya faqat CEO uchun.")
        return new Response('ok')
      }
      await startAssignFlow(chatId)
      return new Response('ok')
    }

    if (text === '📊 Hisobot') {
      const profile = await getLinkedProfile(chatId)
      if (!profile || !(await isCeoProfile(profile.id))) {
        await send(chatId, "Bu funksiya faqat CEO uchun.")
        return new Response('ok')
      }
      await sendReportPicker(chatId)
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
