// Shared "work done" report builder used by both the on-demand bot button
// and the 21:00 Tashkent daily cron push (daily-report). Uzbek only, per the
// bot's existing language rule. Never touches finance/payroll — only tasks,
// task_statuses, time_entries and profiles (for names).
// deno-lint-ignore-file no-explicit-any
export async function buildReport(admin: any, profileId?: string): Promise<string> {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data: doneStatus } = await admin.from('task_statuses').select('id').eq('slug', 'done').maybeSingle()

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

    const workedMs = await workedMsToday(admin, profileId)

    return (
      `📊 ${profile.full_name} bo'yicha hisobot (so'nggi 24 soat):\n\n` +
      `✅ Bajarilgan vazifalar: ${completed?.length ?? 0}\n` +
      `📋 Ochiq vazifalar: ${(openTasks as any)?.length ?? (openTasks as any)?.count ?? 0}\n` +
      `⏱ Bugun ishlagan vaqti: ${formatDuration(workedMs)}`
    )
  }

  // Overall (all employees)
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
    const workedMs = await workedMsToday(admin, p.id)
    if ((completedCount ?? 0) === 0 && workedMs === 0) continue
    lines.push(`• ${p.full_name}: ${completedCount ?? 0} ta vazifa bajarildi, ${formatDuration(workedMs)} ishladi`)
  }

  if (lines.length === 0) return "📊 Umumiy hisobot (so'nggi 24 soat):\n\nHozircha faoliyat yo'q."
  return `📊 Umumiy hisobot (so'nggi 24 soat):\n\n${lines.join('\n')}`
}

async function workedMsToday(admin: any, profileId: string): Promise<number> {
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const { data: entries } = await admin
    .from('time_entries')
    .select('started_at, ended_at')
    .eq('profile_id', profileId)
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
