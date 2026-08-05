// Triggered by a Postgres trigger on time_entries (see migration
// 0027_attendance_notify.sql) via pg_net, the instant someone presses Start
// or Stop on their work timer -- not on a schedule, unlike deadline-check.
// Notifies every CEO (org.full_access) in Uzbek so they see in real time who
// came in and who left, without waiting for the 21:00 daily report.
// Auth: x-cron-secret header, same shared-secret pattern as deadline-check
// and daily-report (this call originates from Postgres itself).
//
// On 'stop' the CEO also gets a per-task breakdown of what that employee
// actually did -- project name, task title, and per-checklist-item done/
// not-done. This replaces the old fixed-21:00 bulk report (see
// 0057_unschedule_daily_report.sql) -- each person's report fires the
// moment they clock out, rather than everyone getting one summary at a
// fixed hour regardless of when they actually worked.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const TASHKENT_OFFSET_HOURS = 5

function tashkentTimeStr(iso: string): string {
  const d = new Date(new Date(iso).getTime() + TASHKENT_OFFSET_HOURS * 60 * 60 * 1000)
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

function tashkentMidnightUtc(): Date {
  const t = new Date(Date.now() + TASHKENT_OFFSET_HOURS * 60 * 60 * 1000)
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate(), -TASHKENT_OFFSET_HOURS, 0, 0))
}

function tashkentDateStr(): string {
  const t = new Date(Date.now() + TASHKENT_OFFSET_HOURS * 60 * 60 * 1000)
  return t.toISOString().slice(0, 10)
}

function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / 60000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${hours} soat ${minutes} daqiqa`
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Chek-list tasks (recurrence_id set) are reported with an explicit
// сделано/не сделано/планируется verdict instead of the plain ✅/📋 block
// used for regular tasks -- literal Russian wording per the CEO's
// instruction ("именно так писать"), even though the rest of the report
// is Uzbek. Daily/one-time items only ever get сделано/не сделано (they
// don't carry a "still time left in the period" concept); weekly/monthly
// items get планируется instead of не сделано while more than a day of
// their interval remains, since regeneration (delete old/create new)
// only happens once the interval is actually up.
function checklistVerdict(recurrenceSlug: string, isDone: boolean, createdAt: string): string {
  if (isDone) return 'сделано'
  if (recurrenceSlug === 'daily' || recurrenceSlug === 'one_time') return 'не сделано'
  const regenAt = new Date(createdAt)
  if (recurrenceSlug === 'weekly') regenAt.setDate(regenAt.getDate() + 7)
  else regenAt.setMonth(regenAt.getMonth() + 1)
  const hoursLeft = (regenAt.getTime() - Date.now()) / (60 * 60 * 1000)
  return hoursLeft <= 24 ? 'не сделано' : 'планируется'
}

// deno-lint-ignore no-explicit-any
async function buildEmployeeTaskReport(admin: any, profileId: string): Promise<string> {
  const { data: doneStatus } = await admin.from('task_statuses').select('id').eq('slug', 'done').maybeSingle()
  const doneId = doneStatus?.id ?? null
  const todayStart = tashkentMidnightUtc().toISOString()

  const { data: openTasksRaw } = await admin
    .from('tasks')
    .select('id, title, project_id, recurrence_id, created_at')
    .eq('assignee_profile_id', profileId)
    .neq('status_id', doneId ?? '00000000-0000-0000-0000-000000000000')

  const { data: doneTodayTasksRaw } = await admin
    .from('tasks')
    .select('id, title, project_id, recurrence_id, created_at')
    .eq('assignee_profile_id', profileId)
    .eq('status_id', doneId ?? '00000000-0000-0000-0000-000000000000')
    .gte('completed_at', todayStart)

  const allTasksRaw = [...(openTasksRaw ?? []), ...(doneTodayTasksRaw ?? [])]
  if (allTasksRaw.length === 0) return ''

  const { data: recurrenceTypes } = await admin.from('recurrence_types').select('id, slug')
  const recurrenceSlugOf = (id: string | null) =>
    id ? (recurrenceTypes ?? []).find((r: { id: string }) => r.id === id)?.slug ?? null : null

  const openTasks = (openTasksRaw ?? []).filter((t: { recurrence_id: string | null }) => !t.recurrence_id)
  const doneTodayTasks = (doneTodayTasksRaw ?? []).filter((t: { recurrence_id: string | null }) => !t.recurrence_id)
  const checklistTasks = allTasksRaw.filter((t: { recurrence_id: string | null }) => !!t.recurrence_id)

  const allTaskIds = allTasksRaw.map((t: { id: string }) => t.id)

  const { data: items } = await admin
    .from('task_items')
    .select('task_id, title, is_done')
    .in('task_id', allTaskIds)

  const projectIds = [...new Set(allTasksRaw.map((t: { project_id: string | null }) => t.project_id).filter(Boolean))]
  const { data: projects } = projectIds.length > 0
    ? await admin.from('projects').select('id, name').in('id', projectIds)
    : { data: [] }
  const projectNameFor = (projectId: string | null) =>
    projectId ? ((projects ?? []).find((p: { id: string }) => p.id === projectId)?.name ?? null) : null

  const itemsFor = (taskId: string) => (items ?? []).filter((i: { task_id: string }) => i.task_id === taskId)
  const taskLabel = (task: { title: string; project_id: string | null }) => {
    const projectName = projectNameFor(task.project_id)
    return projectName ? `${escapeHtml(task.title)} <i>(${escapeHtml(projectName)})</i>` : escapeHtml(task.title)
  }

  // Blank line between each task (incl. its own checklist right under it,
  // never the next task's) so a multi-task report doesn't read as one
  // run-on block -- "-" for not-done instead of "▫️", which read as an
  // unlabeled blank square rather than "not done".
  const blocks: string[] = []

  for (const task of doneTodayTasks) {
    const taskItems = itemsFor(task.id)
    const block = [`✅ <b>${taskLabel(task)}</b> — bajarildi`]
    if (taskItems.length > 0) {
      block.push(`   ✅ barcha chek-list bandlari bajarildi: ${taskItems.map((i: { title: string }) => escapeHtml(i.title)).join(', ')}`)
    }
    blocks.push(block.join('\n'))
  }

  for (const task of openTasks) {
    const taskItems = itemsFor(task.id)
    const block = [`📋 <b>${taskLabel(task)}</b>`]
    if (taskItems.length > 0) {
      const done = taskItems.filter((i: { is_done: boolean }) => i.is_done).map((i: { title: string }) => escapeHtml(i.title))
      const notDone = taskItems.filter((i: { is_done: boolean }) => !i.is_done).map((i: { title: string }) => escapeHtml(i.title))
      if (done.length > 0) block.push(`   ✅ ${done.join(', ')}`)
      if (notDone.length > 0) block.push(`   - ${notDone.join(', ')}`)
    }
    blocks.push(block.join('\n'))
  }

  if (checklistTasks.length > 0) {
    const checklistLines = checklistTasks.map((task: { id: string; title: string; recurrence_id: string | null; created_at: string }) => {
      const slug = recurrenceSlugOf(task.recurrence_id) ?? 'one_time'
      const isDone = (doneTodayTasksRaw ?? []).some((t: { id: string }) => t.id === task.id)
      const verdict = checklistVerdict(slug, isDone, task.created_at)
      return `☑️ <b>${escapeHtml(task.title)}</b> — ${verdict}`
    })
    blocks.push(`📌 <b>Chek-list:</b>\n${checklistLines.join('\n')}`)
  }

  return blocks.join('\n\n')
}

// General (not employee-specific) roll-up appended to every clock-out
// report: what shipped today across ALL projects, from content-plan ish
// тури (deliverable_type) selections, counting only items whose status is
// "жойланди" (published) with today's publish_date -- each selected work
// type on an item counts on its own, same granularity as the content-plan
// card's own percent calc.
// deno-lint-ignore no-explicit-any
async function buildProjectsPublishedReport(admin: any): Promise<string> {
  const { data: publishedStatus } = await admin.from('content_statuses').select('id').eq('slug', 'published').maybeSingle()
  const publishedId = publishedStatus?.id
  if (!publishedId) return ''

  const today = tashkentDateStr()
  const { data: items } = await admin
    .from('content_plan_items')
    .select('id, project_id')
    .eq('status_id', publishedId)
    .eq('publish_date', today)
  if (!items || items.length === 0) return ''

  const itemIds = items.map((i: { id: string }) => i.id)
  const { data: itemTypes } = await admin
    .from('content_plan_deliverable_types')
    .select('content_plan_item_id, deliverable_type_id')
    .in('content_plan_item_id', itemIds)
  const { data: deliverableTypes } = await admin.from('deliverable_types').select('id, label_uz')
  const { data: projects } = await admin.from('projects').select('id, name')

  const typeLabel = (id: string) =>
    (deliverableTypes ?? []).find((d: { id: string }) => d.id === id)?.label_uz ?? '—'
  const projectName = (id: string | null) =>
    (projects ?? []).find((p: { id: string }) => p.id === id)?.name ?? '—'

  const byProject = new Map<string, Map<string, number>>()
  for (const item of items as { id: string; project_id: string | null }[]) {
    const types = (itemTypes ?? []).filter((t: { content_plan_item_id: string }) => t.content_plan_item_id === item.id)
    const key = item.project_id ?? '—'
    const typeMap = byProject.get(key) ?? new Map<string, number>()
    if (types.length === 0) {
      typeMap.set('—', (typeMap.get('—') ?? 0) + 1)
    } else {
      for (const t of types as { deliverable_type_id: string }[]) {
        const label = typeLabel(t.deliverable_type_id)
        typeMap.set(label, (typeMap.get(label) ?? 0) + 1)
      }
    }
    byProject.set(key, typeMap)
  }

  const lines: string[] = []
  for (const [projectId, typeMap] of byProject) {
    const parts = [...typeMap.entries()].map(([label, count]) => `${escapeHtml(label)} ×${count}`)
    lines.push(`<b>${escapeHtml(projectName(projectId === '—' ? null : projectId))}</b>: ${parts.join(', ')}`)
  }

  return `📁 <b>Loyihalar bo'yicha bugungi natija:</b>\n${lines.join('\n')}`
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

  let text =
    event === 'start'
      ? `🟢 <b>${escapeHtml(name)}</b> ishni boshladi — ${tashkentTimeStr(occurred_at)}`
      : `🔴 <b>${escapeHtml(name)}</b> ishni tugatdi — ${tashkentTimeStr(occurred_at)} (${formatDuration(
          new Date(occurred_at).getTime() - new Date(started_at).getTime()
        )})`

  if (event === 'stop') {
    const report = await buildEmployeeTaskReport(admin, profile_id)
    if (report) text += `\n\n${report}`
    const projectsReport = await buildProjectsPublishedReport(admin)
    if (projectsReport) text += `\n\n${projectsReport}`
  }

  const { data: profiles } = await admin.from('profiles').select('id')

  // Recipients: CEO + every PM (org-wide, same as elsewhere in the app --
  // 'projects.manage' is the capability, not a role-slug check) + the
  // employee themselves, so a montajchi's own clock-out report reaches
  // them too, not just management.
  for (const p of profiles ?? []) {
    let shouldNotify = p.id === profile_id
    if (!shouldNotify) {
      const { data: isCeo } = await admin.rpc('has_capability_for_profile', {
        p_profile_id: p.id,
        p_capability: 'org.full_access',
      })
      shouldNotify = !!isCeo
    }
    if (!shouldNotify) {
      const { data: isPm } = await admin.rpc('has_capability_for_profile', {
        p_profile_id: p.id,
        p_capability: 'projects.manage',
      })
      shouldNotify = !!isPm
    }
    if (!shouldNotify) continue
    const { data: links } = await admin.from('profile_telegram_links').select('chat_id').eq('profile_id', p.id)
    for (const link of links ?? []) {
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: link.chat_id, text, parse_mode: 'HTML' }),
      })
    }
  }

  return new Response('ok')
})
