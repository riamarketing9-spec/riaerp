// CEO-only: permanently deletes an employee's auth account (profiles row
// cascades via auth_user_id references auth.users(id) on delete cascade).
// Must run server-side — deleting auth.users requires the service role key.
import { createClient } from 'jsr:@supabase/supabase-js@2'

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
    if (!isCeo) {
      return new Response(JSON.stringify({ error: 'Forbidden: CEO only' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { profile_id } = await req.json()
    if (!profile_id) throw new Error('profile_id is required')

    const admin = createClient(supabaseUrl, serviceRoleKey)

    const { data: profile, error: profileErr } = await admin
      .from('profiles')
      .select('auth_user_id')
      .eq('id', profile_id)
      .single()
    if (profileErr) throw profileErr
    if (!profile.auth_user_id) throw new Error('Profile has no linked auth user')

    // profiles.id -> auth.users(id) cascades, but several tables reference
    // profiles(id) with no ON DELETE behavior of their own (e.g. a profile's
    // self-created checklist_instances from visiting /cabinet). Postgres
    // then blocks the cascade with a foreign-key violation. Clean up the
    // rows that are safe to drop entirely before deleting the auth user.
    await admin.from('checklist_instances').delete().eq('profile_id', profile_id)
    await admin.from('notification_log').delete().eq('profile_id', profile_id)
    await admin.from('client_interactions').delete().eq('profile_id', profile_id)
    await admin.from('task_comments').delete().eq('author_profile_id', profile_id)
    await admin.from('document_visibility').delete().eq('profile_id', profile_id)

    const { error: deleteErr } = await admin.auth.admin.deleteUser(profile.auth_user_id)
    if (deleteErr) throw deleteErr

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
