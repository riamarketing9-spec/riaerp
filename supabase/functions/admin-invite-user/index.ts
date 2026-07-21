// CEO or team.manage: creates a new employee auth account + profile (via
// the handle_new_auth_user trigger, which reads role_slug from
// user_metadata). Must run server-side because creating auth.users
// requires the service role key, which can never be shipped to the
// browser bundle.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Missing Authorization header')

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Caller-scoped client: used only to verify the caller is actually CEO
    // or a team.manage holder (e.g. a PM), via the existing is_ceo()/
    // has_capability() SQL functions (respects RLS/JWT normally).
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: isCeo, error: ceoErr } = await callerClient.rpc('is_ceo')
    if (ceoErr) throw ceoErr
    const { data: canManageTeam, error: capErr } = await callerClient.rpc('has_capability', {
      cap: 'team.manage',
    })
    if (capErr) throw capErr
    if (!isCeo && !canManageTeam) {
      return new Response(JSON.stringify({ error: 'Forbidden: requires team.manage or CEO' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { email, password, full_name, role_slug, department_slug } = await req.json()
    if (!email || !password || !full_name || !role_slug) {
      throw new Error('email, password, full_name, role_slug are all required')
    }
    // A team.manage holder who isn't a true CEO must never be able to
    // invite someone directly into the ceo role — only a real CEO can.
    if (!isCeo && role_slug === 'ceo') {
      return new Response(JSON.stringify({ error: 'Only CEO can invite a CEO-role employee' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const admin = createClient(supabaseUrl, serviceRoleKey)
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name, role_slug, department_slug },
    })
    if (createErr) throw createErr

    return new Response(JSON.stringify({ user_id: created.user.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
