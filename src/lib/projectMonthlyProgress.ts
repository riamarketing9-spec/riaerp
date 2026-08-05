// Shared by ProjectsPage (card progress bar + its drill-down dialog) and
// KpiReportsPage (Loyiha bo'yicha tab) so "how much of this month's goal is
// done" is computed exactly once, not reimplemented twice and drifting.
//
// Percent is computed strictly per work type (ish turi): each target row
// is a (format_id, target_count) pair, and each published content-plan
// item counts toward EVERY work type it has selected (via
// content_plan_formats), not just one bucket -- an item with both
// "carousel" and "reels" selected counts once toward each target
// independently. Nothing outside content-plan formats feeds into this
// number anymore (no task-deliverable-label "ads/target" component).

export type FormatTarget = { format_id: string; target_count: number }
export type MonthlyContentItem = { id: string; topic: string; publish_date: string | null; formatIds: string[] }

export type MonthlyProgressFormatDetail = {
  format_id: string
  label: string
  target: number
  items: MonthlyContentItem[]
}

export function computeMonthlyProgress({
  targets,
  items,
  formatLabelOf,
}: {
  targets: FormatTarget[] | undefined
  items: MonthlyContentItem[]
  formatLabelOf: (formatId: string) => string
}) {
  if (!targets || targets.length === 0) return null

  const perFormat: MonthlyProgressFormatDetail[] = targets.map((t) => ({
    format_id: t.format_id,
    label: formatLabelOf(t.format_id),
    target: t.target_count,
    items: items.filter((i) => i.formatIds.includes(t.format_id)),
  }))

  const quotaTotal = perFormat.reduce((sum, f) => sum + f.target, 0)
  const doneTotal = perFormat.reduce((sum, f) => sum + Math.min(f.items.length, f.target), 0)
  const percent = quotaTotal === 0 ? null : Math.round((doneTotal / quotaTotal) * 100)

  return { percent, quotaTotal, perFormat }
}
