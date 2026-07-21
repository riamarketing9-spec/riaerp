// CEO-only: permanently deletes an employee's auth account (profiles row
// cascades via auth_user_id references auth.users(id) on delete cascade).
// Must run server-side — deleting auth.users requires the service role key.
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

    const { error: deleteErr } = await admin.auth.admin.deleteUser(profile.auth_user_id)
    if (deleteErr) throw deleteErr

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
