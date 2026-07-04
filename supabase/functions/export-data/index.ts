// One-click backup: runs with the CALLER's JWT (not the service role), so
// Postgres RLS naturally limits each user to exporting only what they can
// already see — for CEO that's everything, for a specialist just their own
// cabinet's worth. Returns one JSON object keyed by table name.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const EXPORTABLE_TABLES = [
  'profiles', 'roles', 'departments',
  'projects', 'project_members', 'tasks',
  'content_plan_items', 'content_plan_platforms',
  'clients', 'leads',
  'documents', 'org_positions',
  'finance_project_revenue', 'finance_expenses',
  'payroll_rate_table', 'payroll_fixed_salary', 'payroll_runs', 'payroll_run_lines',
  'checklist_instances', 'checklist_instance_items',
  'kb_articles',
]

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Missing Authorization header')

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: userData, error: userErr } = await callerClient.auth.getUser()
    if (userErr || !userData.user) throw new Error('Not authenticated')

    const result: Record<string, unknown> = {}
    for (const table of EXPORTABLE_TABLES) {
      const { data, error } = await callerClient.from(table).select('*')
      result[table] = error ? { error: error.message } : data
    }

    const { data: profile } = await callerClient
      .from('profiles')
      .select('id')
      .eq('auth_user_id', userData.user.id)
      .maybeSingle()

    if (profile) {
      await callerClient.from('export_log').insert({ profile_id: profile.id })
    }

    return new Response(JSON.stringify(result, null, 2), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="ria-erp-export-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
