// Config-driven registry of small reference/lookup tables the CEO can manage
// from LookupManagerPage. Every table listed here already has RLS policies
// granting the CEO full CRUD (see supabase/migrations/*.sql — either a named
// `<table>_write` policy or a dynamic do-loop-generated one), confirmed by
// reading the migrations before this file was written. This is pure frontend
// config; no DB objects are created or altered here.

export type LookupExtraField = {
  /** Column name in the DB. */
  name: string
  /** i18n key (under lookupManager.*) for the field's label. */
  labelKey: string
  type: 'number'
}

export type LookupTableConfig = {
  /** Physical table name in Supabase/Postgres. */
  table: string
  /** i18n key (under lookupManager.tables.*) for the table's display name. */
  labelKey: string
  /**
   * Whether the table has label_ru/label_uz columns. False only for
   * contract_types, which (per 0003_sales_hr_finance.sql) has just `slug`.
   */
  hasLabels: boolean
  /** Whether the table has a sort_order int column. */
  hasSortOrder: boolean
  /** Extra numeric columns beyond the common slug/label_ru/label_uz/sort_order shape. */
  extraFields: LookupExtraField[]
}

export const LOOKUP_TABLES: LookupTableConfig[] = [
  { table: 'content_rubrics', labelKey: 'lookupManager.tables.contentRubrics', hasLabels: true, hasSortOrder: true, extraFields: [] },
  { table: 'content_formats', labelKey: 'lookupManager.tables.contentFormats', hasLabels: true, hasSortOrder: false, extraFields: [] },
  { table: 'platforms', labelKey: 'lookupManager.tables.platforms', hasLabels: true, hasSortOrder: false, extraFields: [] },
  { table: 'deliverable_types', labelKey: 'lookupManager.tables.deliverableTypes', hasLabels: true, hasSortOrder: false, extraFields: [] },
  { table: 'client_statuses', labelKey: 'lookupManager.tables.clientStatuses', hasLabels: true, hasSortOrder: false, extraFields: [] },
  { table: 'lead_stages', labelKey: 'lookupManager.tables.leadStages', hasLabels: true, hasSortOrder: true, extraFields: [] },
  { table: 'expense_categories', labelKey: 'lookupManager.tables.expenseCategories', hasLabels: true, hasSortOrder: false, extraFields: [] },
  { table: 'document_categories', labelKey: 'lookupManager.tables.documentCategories', hasLabels: true, hasSortOrder: false, extraFields: [] },
  { table: 'staff_statuses', labelKey: 'lookupManager.tables.staffStatuses', hasLabels: true, hasSortOrder: false, extraFields: [] },
  // contract_types has ONLY an `slug` column (no label_ru/label_uz) — confirmed
  // in supabase/migrations/0003_sales_hr_finance.sql, no later migration adds labels.
  { table: 'contract_types', labelKey: 'lookupManager.tables.contractTypes', hasLabels: false, hasSortOrder: false, extraFields: [] },
  { table: 'project_types', labelKey: 'lookupManager.tables.projectTypes', hasLabels: true, hasSortOrder: false, extraFields: [] },
  { table: 'project_statuses', labelKey: 'lookupManager.tables.projectStatuses', hasLabels: true, hasSortOrder: true, extraFields: [] },
  { table: 'task_statuses', labelKey: 'lookupManager.tables.taskStatuses', hasLabels: true, hasSortOrder: true, extraFields: [] },
  { table: 'content_statuses', labelKey: 'lookupManager.tables.contentStatuses', hasLabels: true, hasSortOrder: true, extraFields: [] },
  {
    table: 'task_term_types',
    labelKey: 'lookupManager.tables.taskTermTypes',
    hasLabels: true,
    hasSortOrder: true,
    extraFields: [
      { name: 'day_min', labelKey: 'lookupManager.dayMin', type: 'number' },
      { name: 'day_max', labelKey: 'lookupManager.dayMax', type: 'number' },
      { name: 'weight', labelKey: 'lookupManager.weight', type: 'number' },
    ],
  },
  {
    table: 'task_priority_quadrants',
    labelKey: 'lookupManager.tables.taskPriorityQuadrants',
    hasLabels: true,
    hasSortOrder: true,
    extraFields: [{ name: 'weight', labelKey: 'lookupManager.weight', type: 'number' }],
  },
]

/** A row from any of the tables above — shape varies per LookupTableConfig. */
export type LookupRow = {
  id: string
  slug: string
  label_ru?: string
  label_uz?: string
  sort_order?: number
  [key: string]: unknown
}

export function lookupSelectColumns(config: LookupTableConfig): string {
  const cols = ['id', 'slug']
  if (config.hasLabels) cols.push('label_ru', 'label_uz')
  if (config.hasSortOrder) cols.push('sort_order')
  for (const f of config.extraFields) cols.push(f.name)
  return cols.join(', ')
}
