// Shared by ProjectsPage (card progress bar + its drill-down dialog) and
// KpiReportsPage (Loyiha bo'yicha tab) so "how much of this month's goal is
// done" is computed exactly once, not reimplemented twice and drifting.

// "Post" target counts reels + post + carousel together, per spec.
export const POST_BUCKET_FORMAT_SLUGS = ['post', 'reels', 'carousel']

// Which "ish turi" (deliverable type) label counts toward the target quota
// -- matched by label_uz since new types get added through the lookup
// admin UI with auto-generated, unpredictable slugs.
export const TARGET_TASK_LABELS = ['target sozlash', "voronka bo'yicha ishlash"]

export type MonthlyGoal = { target_posts: number; target_stories: number; target_ads: boolean }
export type MonthlyContentItem = { id: string; format_id: string; topic: string; publish_date: string | null }
export type MonthlyDoneTask = { id: string; title: string; completed_at: string | null }

export type TaskDeliverableLink = { task_id: string; deliverable_type_id: string }

export function computeMonthlyProgress({
  goal,
  items,
  doneTasks,
  taskDeliverables,
  formatSlugOf,
  deliverableLabelOf,
}: {
  goal: MonthlyGoal | undefined
  items: MonthlyContentItem[]
  doneTasks: MonthlyDoneTask[]
  taskDeliverables: TaskDeliverableLink[]
  formatSlugOf: (formatId: string) => string | undefined
  deliverableLabelOf: (deliverableTypeId: string) => string
}) {
  if (!goal) return null

  const postsItems = items.filter((i) => POST_BUCKET_FORMAT_SLUGS.includes(formatSlugOf(i.format_id) ?? ''))
  const storiesItems = items.filter((i) => formatSlugOf(i.format_id) === 'stories')

  const targetTasks = doneTasks.filter((tsk) => {
    const labels = taskDeliverables
      .filter((td) => td.task_id === tsk.id)
      .map((td) => deliverableLabelOf(td.deliverable_type_id))
    return labels.some((l) => TARGET_TASK_LABELS.includes(l))
  })

  const quotaTotal = goal.target_posts + goal.target_stories + (goal.target_ads ? 1 : 0)
  const percent =
    quotaTotal === 0
      ? null
      : Math.round(
          ((Math.min(postsItems.length, goal.target_posts) +
            Math.min(storiesItems.length, goal.target_stories) +
            (goal.target_ads && targetTasks.length > 0 ? 1 : 0)) /
            quotaTotal) *
            100
        )

  return { percent, quotaTotal, postsItems, storiesItems, targetTasks, goal }
}
