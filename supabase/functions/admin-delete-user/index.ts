// CEO or team.manage: removes an employee from the active roster. Soft
// delete, not a hard one -- the profiles row stays (so historical
// tasks/content-plan items still resolve a name, and there's a record of
// who was removed), but the auth account is banned so access to the ERP is
// revoked immediately, and deleted_at/deleted_by are stamped so the removal
// shows up in the team's history. Must run server-side — banning
// auth.users requires the service role key.
import { createClient } from 'jsr:@supabase/supabase-js@2'

// ~100 years: GoTrue has no "permanent" ban, only a duration: this is the
// conventional stand-in for one.
const PERMANENT_BAN_DURATION = '876000h'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Missing Authorization header')

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

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

    const { profile_id } = await req.json()
    if (!profile_id) throw new Error('profile_id is required')

    const admin = createClient(supabaseUrl, serviceRoleKey)

    // profiles -> roles is ambiguous to PostgREST since 0020 added
    // employee_roles (a second, many-to-many path to roles for secondary
    // positions): the FK name pins it to the direct role_id relationship.
    const { data: profile, error: profileErr } = await admin
      .from('profiles')
      .select('auth_user_id, role_id, deleted_at, roles!profiles_role_id_fkey(slug)')
      .eq('id', profile_id)
      .single()
    if (profileErr) throw profileErr
    if (!profile.auth_user_id) throw new Error('Profile has no linked auth user')
    if (profile.deleted_at) throw new Error('Employee is already removed')
    // A team.manage holder who isn't a true CEO must never be able to
    // delete a CEO-role profile — only a real CEO can. This is the only
    // real enforcement point for delete, since the ban below runs under
    // the service-role key and bypasses RLS entirely.
    const targetRoleSlug = (profile as { roles?: { slug: string } | null }).roles?.slug
    if (!isCeo && targetRoleSlug === 'ceo') {
      return new Response(JSON.stringify({ error: 'Only CEO can delete a CEO-role employee' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Caller's own profile id, for deleted_by — resolved from the verified
    // JWT (via the anon-key client bound to the caller's Authorization
    // header) rather than trusted from the request body, so it can't be
    // spoofed.
    const {
      data: { user: callerUser },
    } = await callerClient.auth.getUser()
    const { data: callerProfile } = await admin
      .from('profiles')
      .select('id')
      .eq('auth_user_id', callerUser?.id ?? '')
      .maybeSingle()

    const { error: banErr } = await admin.auth.admin.updateUserById(profile.auth_user_id, {
      ban_duration: PERMANENT_BAN_DURATION,
    })
    if (banErr) throw banErr

    const { data: inactiveStatus } = await admin
      .from('staff_statuses')
      .select('id')
      .eq('slug', 'inactive')
      .maybeSingle()

    const { error: updateErr } = await admin
      .from('profiles')
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by: callerProfile?.id ?? null,
        ...(inactiveStatus ? { staff_status_id: inactiveStatus.id } : {}),
      })
      .eq('id', profile_id)
    if (updateErr) throw updateErr

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const message =
      err instanceof Error ? err.message : typeof err === 'string' ? err : JSON.stringify(err)
    return new Response(JSON.stringify({ error: message || 'Unknown error' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
