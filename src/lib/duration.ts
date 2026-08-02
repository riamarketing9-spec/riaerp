// Shared by TaskSheet (status-duration log) and TaskCard (subtask
// completion time) so the two don't drift into different formats.
export function formatDurationMs(ms: number): string {
  const totalMinutes = Math.round(Math.max(0, ms) / 60000)
  const days = Math.floor(totalMinutes / (60 * 24))
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60)
  const minutes = totalMinutes % 60
  if (days > 0) return `${days}d ${hours}h`
  return `${hours}h ${minutes}m`
}
