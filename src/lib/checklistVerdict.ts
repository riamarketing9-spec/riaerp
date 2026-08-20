// Ported 1:1 from supabase/functions/attendance-notify/index.ts
// (checklistVerdict) -- same terminology as the Telegram bot report, so the
// web analytics never disagrees with what the bot already told the team.
export type ChecklistVerdict = 'сделано' | 'не сделано' | 'планируется'

export function checklistVerdict(
  recurrenceSlug: string | null | undefined,
  isDone: boolean,
  createdAt: string
): ChecklistVerdict {
  if (isDone) return 'сделано'
  if (recurrenceSlug === 'daily' || recurrenceSlug === 'one_time') return 'не сделано'
  const regenAt = new Date(createdAt)
  if (recurrenceSlug === 'weekly') regenAt.setDate(regenAt.getDate() + 7)
  else regenAt.setMonth(regenAt.getMonth() + 1)
  const hoursLeft = (regenAt.getTime() - Date.now()) / (60 * 60 * 1000)
  return hoursLeft <= 24 ? 'не сделано' : 'планируется'
}
