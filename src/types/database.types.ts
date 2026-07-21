// Hand-written to match supabase/migrations/*.sql (Stage 1 tables + views used by the app).
// Regenerate/replace with `supabase gen types typescript` once a CLI access token is available;
// keep this file's shape (Database.public.Tables/Views) so supabase-js generics keep working.

type RoleRow = {
  id: string
  slug: string
  label_ru: string
  label_uz: string
  is_management: boolean
  max_open_tasks: number
  created_at: string
}

type RoleCapabilityRow = { role_id: string; capability: string }

type EmployeeRoleRow = { profile_id: string; role_id: string }

type ProfileCapabilityOverrideRow = {
  profile_id: string
  capability: string
  granted: boolean
  granted_by: string | null
  created_at: string
}

type DepartmentRow = { id: string; slug: string; label_ru: string; label_uz: string; created_at: string }

type StaffStatusRow = { id: string; slug: string; label_ru: string; label_uz: string }

type WorkloadLevelRow = { id: string; slug: string; label_ru: string; label_uz: string; color: string; sort_order: number }

type ProfileRow = {
  id: string
  auth_user_id: string | null
  full_name: string
  phone: string | null
  telegram_chat_id: string | null
  role_id: string
  department_id: string | null
  staff_status_id: string | null
  workload_level_id: string | null
  hire_date: string | null
  avatar_url: string | null
  created_at: string
  updated_at: string
}

type ProjectTypeRow = { id: string; slug: string; label_ru: string; label_uz: string }

type ProjectStatusRow = { id: string; slug: string; label_ru: string; label_uz: string; sort_order: number }

type ProjectRow = {
  id: string
  name: string
  department_id: string | null
  project_type_id: string
  status_id: string
  pm_profile_id: string
  client_id: string | null
  goal: string | null
  target_audience: string | null
  monthly_quota_posts: number | null
  monthly_quota_reels: number | null
  monthly_quota_stories: number | null
  monthly_quota_shoots: number | null
  billing_day: number | null
  deliverables_text: string | null
  brief_detail_text: string | null
  target_audience_voice_url: string | null
  target_audience_file_url: string | null
  created_at: string
  updated_at: string
}

type ProjectMemberRow = { project_id: string; profile_id: string; role_on_project: string | null }

type TaskStatusRow = { id: string; slug: string; label_ru: string; label_uz: string; sort_order: number }

type PriorityRow = { id: string; slug: string; label_ru: string; label_uz: string; weight: number }

type RecurrenceTypeRow = { id: string; slug: string; label_ru: string; label_uz: string }

type TaskTermTypeRow = {
  id: string
  slug: string
  label_ru: string
  label_uz: string
  day_min: number
  day_max: number
  weight: number
  sort_order: number
}

type TaskItemRow = {
  id: string
  task_id: string
  title: string
  is_done: boolean
  sort_order: number
  created_at: string
}

type TaskPriorityQuadrantRow = {
  id: string
  slug: string
  label_ru: string
  label_uz: string
  weight: number
  sort_order: number
}

type TaskRow = {
  id: string
  title: string
  project_id: string | null
  assignee_profile_id: string | null
  status_id: string
  priority_id: string | null
  term_type_id: string | null
  quadrant_id: string | null
  starts_at: string | null
  recurrence_id: string | null
  deadline: string | null
  percent_complete: number
  blocker_text: string | null
  deliverable_text: string | null
  content_plan_item_id: string | null
  deliverable_type_id: string | null
  created_by: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

type AuditLogRow = {
  id: string
  table_name: string
  record_id: string | null
  action: string
  actor_profile_id: string | null
  changed_at: string
  diff: unknown
}

type KbReadRow = { profile_id: string; article_id: string; read_at: string }

type ContractTypeRow = { id: string; slug: string }

type ContractRow = {
  id: string
  contract_type_id: string
  party_client_id: string | null
  party_profile_id: string | null
  storage_path: string
  start_date: string | null
  end_date: string | null
  status: string | null
  created_at: string
}

type TaskDeliverableTypeRow = { task_id: string; deliverable_type_id: string }

type TaskCommentRow = {
  id: string
  task_id: string
  author_profile_id: string
  body: string
  created_at: string
}

type ContentFormatRow = { id: string; slug: string; label_ru: string; label_uz: string }

type PlatformRow = { id: string; slug: string; label_ru: string; label_uz: string }

type ContentStatusRow = { id: string; slug: string; label_ru: string; label_uz: string; sort_order: number }

type ContentPlanItemRow = {
  id: string
  project_id: string
  topic: string
  format_id: string
  script: string | null
  tor_text: string | null
  deliverable_type_id: string | null
  shooter_profile_id: string | null
  editor_profile_id: string | null
  responsible_profile_id: string | null
  shoot_date: string | null
  edit_done_date: string | null
  cover_done_date: string | null
  publish_date: string | null
  attachment_url: string | null
  status_id: string
  created_at: string
  updated_at: string
}

type ChecklistCadenceRow = { id: string; slug: string }

type ChecklistTemplateRow = {
  id: string
  cadence_id: string
  role_id: string | null
  department_id: string | null
  title: string
  applies_to_all: boolean
}

type ChecklistTemplateItemRow = { id: string; template_id: string; label_ru: string; label_uz: string; sort_order: number; requires_note: boolean }

type ChecklistInstanceRow = {
  id: string
  template_id: string
  profile_id: string
  period_date: string
  completed_at: string | null
  created_at: string
}

type ChecklistInstanceItemRow = { id: string; instance_id: string; template_item_id: string; is_checked: boolean; note: string | null }

type IndustryRow = { id: string; slug: string; label_ru: string; label_uz: string }

type ClientStatusRow = { id: string; slug: string; label_ru: string; label_uz: string }

type ClientRow = {
  id: string
  name: string
  contact_name: string | null
  contact_phone: string | null
  contact_telegram: string | null
  industry_id: string | null
  industry_text: string | null
  status_id: string
  created_at: string
  updated_at: string
}

type LeadStageRow = { id: string; slug: string; label_ru: string; label_uz: string; sort_order: number }

type LeadRow = {
  id: string
  client_id: string
  stage_id: string
  owner_profile_id: string | null
  expected_value: number | null
  next_action_date: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

type ClientInteractionRow = {
  id: string
  client_id: string
  profile_id: string | null
  note: string
  created_at: string
}

type ProjectMonthlyGoalRow = {
  id: string
  project_id: string
  month: string
  goal_text: string
  created_at: string
}

type OrgPositionRow = {
  id: string
  title: string
  parent_position_id: string | null
  profile_id: string | null
  created_at: string
}

type DocumentCategoryRow = { id: string; slug: string; label_ru: string; label_uz: string }

type DocumentRow = {
  id: string
  title: string
  storage_path: string
  category_id: string | null
  uploaded_by: string | null
  is_org_wide: boolean
  created_at: string
}

type DocumentVisibilityRow = {
  document_id: string
  profile_id: string
  granted_by: string | null
  granted_at: string
}

type ExpenseCategoryRow = { id: string; slug: string; label_ru: string; label_uz: string }

type ExpenseScopeRow = { id: string; slug: string }

type DeliverableTypeRow = { id: string; slug: string; label_ru: string; label_uz: string }

type FinanceProjectRevenueRow = {
  id: string
  project_id: string
  month: string
  amount: number
  created_at: string
}

type FinanceExpenseRow = {
  id: string
  expense_date: string
  amount: number
  category_id: string | null
  scope_id: string
  project_id: string | null
  note: string | null
  receipt_storage_path: string | null
  created_at: string
}

type PayrollRateRow = {
  id: string
  profile_id: string
  deliverable_type_id: string
  rate: number
  effective_from: string
  effective_to: string | null
}

type PayrollFixedSalaryRow = {
  id: string
  profile_id: string
  monthly_amount: number
  effective_from: string
  effective_to: string | null
}

type PayrollRunRow = {
  id: string
  period_month: string
  generated_at: string
  status: string
}

type PayrollRunLineRow = {
  id: string
  payroll_run_id: string
  profile_id: string
  fixed_component: number
  piece_rate_component: number
  total: number
  detail_json: unknown
}

type ProjectProfitViewRow = {
  project_id: string
  name: string
  total_revenue: number
  total_expenses: number
  profit: number
}

type CeoDashboardViewRow = {
  mrr: number
  active_projects: number
  overdue_tasks: number
  overloaded_employees: number
}

type ContentPlanPlatformRow = { content_plan_item_id: string; platform_id: string }

type KbArticleRow = {
  id: string
  title: string
  body_markdown: string | null
  video_url: string | null
  role_id: string | null
  department_id: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

type EmployeeKpiViewRow = {
  profile_id: string
  full_name: string
  tasks_completed: number
  tasks_on_time: number
  avg_percent_complete: number | null
}

type TaskQueueViewRow = TaskRow & {
  priority_weight: number | null
  deadline_boost: number
  sort_score: number
}

type EmployeeWorkloadViewRow = {
  profile_id: string
  full_name: string
  role_id: string
  open_task_count: number
  max_open_tasks: number
  workload_level_id: string | null
}

function table<Row, RequiredKeys extends keyof Row>(): {
  Row: Row
  Insert: Partial<Row> & Pick<Row, RequiredKeys>
  Update: Partial<Row>
  Relationships: []
} {
  return null as never
}

export type Database = {
  public: {
    Tables: {
      roles: ReturnType<typeof table<RoleRow, 'slug' | 'label_ru' | 'label_uz'>>
      role_capabilities: { Row: RoleCapabilityRow; Insert: RoleCapabilityRow; Update: Partial<RoleCapabilityRow>; Relationships: [] }
      employee_roles: { Row: EmployeeRoleRow; Insert: EmployeeRoleRow; Update: Partial<EmployeeRoleRow>; Relationships: [] }
      profile_capability_overrides: { Row: ProfileCapabilityOverrideRow; Insert: Pick<ProfileCapabilityOverrideRow, 'profile_id' | 'capability' | 'granted'> & Partial<ProfileCapabilityOverrideRow>; Update: Partial<ProfileCapabilityOverrideRow>; Relationships: [] }
      departments: ReturnType<typeof table<DepartmentRow, 'slug' | 'label_ru' | 'label_uz'>>
      staff_statuses: ReturnType<typeof table<StaffStatusRow, 'slug' | 'label_ru' | 'label_uz'>>
      workload_levels: ReturnType<typeof table<WorkloadLevelRow, 'slug' | 'label_ru' | 'label_uz' | 'color'>>
      profiles: ReturnType<typeof table<ProfileRow, 'full_name' | 'role_id'>>
      project_types: ReturnType<typeof table<ProjectTypeRow, 'slug' | 'label_ru' | 'label_uz'>>
      project_statuses: ReturnType<typeof table<ProjectStatusRow, 'slug' | 'label_ru' | 'label_uz'>>
      projects: ReturnType<typeof table<ProjectRow, 'name' | 'project_type_id' | 'status_id' | 'pm_profile_id'>>
      project_members: { Row: ProjectMemberRow; Insert: ProjectMemberRow; Update: Partial<ProjectMemberRow>; Relationships: [] }
      task_statuses: ReturnType<typeof table<TaskStatusRow, 'slug' | 'label_ru' | 'label_uz'>>
      priorities: ReturnType<typeof table<PriorityRow, 'slug' | 'label_ru' | 'label_uz'>>
      recurrence_types: ReturnType<typeof table<RecurrenceTypeRow, 'slug' | 'label_ru' | 'label_uz'>>
      task_term_types: ReturnType<typeof table<TaskTermTypeRow, 'slug' | 'label_ru' | 'label_uz' | 'day_min' | 'day_max' | 'weight'>>
      task_priority_quadrants: ReturnType<typeof table<TaskPriorityQuadrantRow, 'slug' | 'label_ru' | 'label_uz' | 'weight'>>
      task_items: ReturnType<typeof table<TaskItemRow, 'task_id' | 'title'>>
      tasks: ReturnType<typeof table<TaskRow, 'title' | 'status_id'>>
      audit_log: ReturnType<typeof table<AuditLogRow, 'table_name' | 'action'>>
      kb_reads: { Row: KbReadRow; Insert: Pick<KbReadRow, 'profile_id' | 'article_id'> & Partial<KbReadRow>; Update: Partial<KbReadRow>; Relationships: [] }
      contract_types: ReturnType<typeof table<ContractTypeRow, 'slug'>>
      contracts: ReturnType<typeof table<ContractRow, 'contract_type_id' | 'storage_path'>>
      task_comments: ReturnType<typeof table<TaskCommentRow, 'task_id' | 'author_profile_id' | 'body'>>
      task_deliverable_types: { Row: TaskDeliverableTypeRow; Insert: TaskDeliverableTypeRow; Update: Partial<TaskDeliverableTypeRow>; Relationships: [] }
      content_formats: ReturnType<typeof table<ContentFormatRow, 'slug' | 'label_ru' | 'label_uz'>>
      platforms: ReturnType<typeof table<PlatformRow, 'slug' | 'label_ru' | 'label_uz'>>
      content_statuses: ReturnType<typeof table<ContentStatusRow, 'slug' | 'label_ru' | 'label_uz'>>
      content_plan_items: ReturnType<typeof table<ContentPlanItemRow, 'project_id' | 'topic' | 'format_id' | 'status_id'>>
      checklist_cadences: { Row: ChecklistCadenceRow; Insert: ChecklistCadenceRow; Update: Partial<ChecklistCadenceRow>; Relationships: [] }
      checklist_templates: ReturnType<typeof table<ChecklistTemplateRow, 'cadence_id' | 'title'>>
      checklist_template_items: ReturnType<typeof table<ChecklistTemplateItemRow, 'template_id' | 'label_ru' | 'label_uz'>>
      checklist_instances: ReturnType<typeof table<ChecklistInstanceRow, 'template_id' | 'profile_id' | 'period_date'>>
      checklist_instance_items: ReturnType<typeof table<ChecklistInstanceItemRow, 'instance_id' | 'template_item_id'>>
      industries: ReturnType<typeof table<IndustryRow, 'slug' | 'label_ru' | 'label_uz'>>
      client_statuses: ReturnType<typeof table<ClientStatusRow, 'slug' | 'label_ru' | 'label_uz'>>
      clients: ReturnType<typeof table<ClientRow, 'name' | 'status_id'>>
      lead_stages: ReturnType<typeof table<LeadStageRow, 'slug' | 'label_ru' | 'label_uz'>>
      leads: ReturnType<typeof table<LeadRow, 'client_id' | 'stage_id'>>
      org_positions: ReturnType<typeof table<OrgPositionRow, 'title'>>
      client_interactions: ReturnType<typeof table<ClientInteractionRow, 'client_id' | 'note'>>
      project_monthly_goals: ReturnType<typeof table<ProjectMonthlyGoalRow, 'project_id' | 'month' | 'goal_text'>>
      document_categories: ReturnType<typeof table<DocumentCategoryRow, 'slug' | 'label_ru' | 'label_uz'>>
      documents: ReturnType<typeof table<DocumentRow, 'title' | 'storage_path'>>
      document_visibility: { Row: DocumentVisibilityRow; Insert: Pick<DocumentVisibilityRow, 'document_id' | 'profile_id'> & Partial<DocumentVisibilityRow>; Update: Partial<DocumentVisibilityRow>; Relationships: [] }
      expense_categories: ReturnType<typeof table<ExpenseCategoryRow, 'slug' | 'label_ru' | 'label_uz'>>
      expense_scopes: { Row: ExpenseScopeRow; Insert: Pick<ExpenseScopeRow, 'slug'> & Partial<ExpenseScopeRow>; Update: Partial<ExpenseScopeRow>; Relationships: [] }
      deliverable_types: ReturnType<typeof table<DeliverableTypeRow, 'slug' | 'label_ru' | 'label_uz'>>
      finance_project_revenue: ReturnType<typeof table<FinanceProjectRevenueRow, 'project_id' | 'month' | 'amount'>>
      finance_expenses: ReturnType<typeof table<FinanceExpenseRow, 'expense_date' | 'amount' | 'scope_id'>>
      payroll_rate_table: ReturnType<typeof table<PayrollRateRow, 'profile_id' | 'deliverable_type_id' | 'rate' | 'effective_from'>>
      payroll_fixed_salary: ReturnType<typeof table<PayrollFixedSalaryRow, 'profile_id' | 'monthly_amount' | 'effective_from'>>
      payroll_runs: ReturnType<typeof table<PayrollRunRow, 'period_month'>>
      payroll_run_lines: ReturnType<typeof table<PayrollRunLineRow, 'payroll_run_id' | 'profile_id'>>
      content_plan_platforms: { Row: ContentPlanPlatformRow; Insert: ContentPlanPlatformRow; Update: Partial<ContentPlanPlatformRow>; Relationships: [] }
      kb_articles: ReturnType<typeof table<KbArticleRow, 'title'>>
    }
    Views: {
      v_task_queue: { Row: TaskQueueViewRow; Relationships: [] }
      v_employee_workload: { Row: EmployeeWorkloadViewRow; Relationships: [] }
      v_project_profit: { Row: ProjectProfitViewRow; Relationships: [] }
      v_ceo_dashboard: { Row: CeoDashboardViewRow; Relationships: [] }
      v_employee_kpi: { Row: EmployeeKpiViewRow; Relationships: [] }
    }
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}
