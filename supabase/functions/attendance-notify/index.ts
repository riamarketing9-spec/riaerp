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

function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / 60000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${hours} soat ${minutes} daqiqa`
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// deno-lint-ignore no-explicit-any
async function buildEmployeeTaskReport(admin: any, profileId: string): Promise<string> {
  const { data: doneStatus } = await admin.from('task_statuses').select('id').eq('slug', 'done').maybeSingle()
  const doneId = doneStatus?.id ?? null
  const todayStart = tashkentMidnightUtc().toISOString()

  const { data: openTasks } = await admin
    .from('tasks')
    .select('id, title, project_id')
    .eq('assignee_profile_id', profileId)
    .neq('status_id', doneId ?? '00000000-0000-0000-0000-000000000000')

  const { data: doneTodayTasks } = await admin
    .from('tasks')
    .select('id, title, project_id')
    .eq('assignee_profile_id', profileId)
    .eq('status_id', doneId ?? '00000000-0000-0000-0000-000000000000')
    .gte('completed_at', todayStart)

  const allTasks = [...(openTasks ?? []), ...(doneTodayTasks ?? [])]
  if (allTasks.length === 0) return ''
  const allTaskIds = allTasks.map((t: { id: string }) => t.id)

  const { data: items } = await admin
    .from('task_items')
    .select('task_id, title, is_done')
    .in('task_id', allTaskIds)

  const projectIds = [...new Set(allTasks.map((t: { project_id: string | null }) => t.project_id).filter(Boolean))]
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

  for (const task of doneTodayTasks ?? []) {
    const taskItems = itemsFor(task.id)
    const block = [`✅ <b>${taskLabel(task)}</b> — bajarildi`]
    if (taskItems.length > 0) {
      block.push(`   ✅ barcha chek-list bandlari bajarildi: ${taskItems.map((i: { title: string }) => escapeHtml(i.title)).join(', ')}`)
    }
    blocks.push(block.join('\n'))
  }

  for (const task of openTasks ?? []) {
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

  return blocks.join('\n\n')
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
  }

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
        body: JSON.stringify({ chat_id: link.chat_id, text, parse_mode: 'HTML' }),
      })
    }
  }

  return new Response('ok')
})
