// Shared by ProjectsPage (card progress bar + its drill-down dialog) and
// KpiReportsPage (Loyiha bo'yicha tab) so "how much of this month's goal is
// done" is computed exactly once, not reimplemented twice and drifting.
//
// Percent is computed strictly per work type (ish тури = deliverable_types,
// e.g. "Post dizayni", "Syomka", "Reels montaji" -- NOT content_formats,
// which is a different, unrelated field): each target row is a
// (deliverable_type_id, target_count) pair, and each published
// content-plan item counts toward EVERY work type it has selected (via
// content_plan_deliverable_types), not just one bucket -- an item with
// both "carousel" and "reels" work types selected counts once toward each
// target independently. Nothing outside ish тури feeds into this number
// anymore (no task-deliverable-label "ads/target" component).

export type DeliverableTypeTarget = { deliverable_type_id: string; target_count: number }
export type MonthlyContentItem = { id: string; topic: string; publish_date: string | null; deliverableTypeIds: string[] }

export type MonthlyProgressTypeDetail = {
  deliverable_type_id: string
  label: string
  target: number
  items: MonthlyContentItem[]
}

export function computeMonthlyProgress({
  targets,
  items,
  deliverableTypeLabelOf,
}: {
  targets: DeliverableTypeTarget[] | undefined
  items: MonthlyContentItem[]
  deliverableTypeLabelOf: (deliverableTypeId: string) => string
}) {
  if (!targets || targets.length === 0) return null

  const perType: MonthlyProgressTypeDetail[] = targets.map((t) => ({
    deliverable_type_id: t.deliverable_type_id,
    label: deliverableTypeLabelOf(t.deliverable_type_id),
    target: t.target_count,
    items: items.filter((i) => i.deliverableTypeIds.includes(t.deliverable_type_id)),
  }))

  const quotaTotal = perType.reduce((sum, f) => sum + f.target, 0)
  const doneTotal = perType.reduce((sum, f) => sum + Math.min(f.items.length, f.target), 0)
  const percent = quotaTotal === 0 ? null : Math.round((doneTotal / quotaTotal) * 100)

  return { percent, quotaTotal, perType }
}
