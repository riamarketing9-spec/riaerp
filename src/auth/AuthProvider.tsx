import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabaseClient'

type Profile = {
  id: string
  full_name: string
  role_id: string
  avatar_url: string | null
}

type Role = {
  id: string
  slug: string
  label_ru: string
  label_uz: string
  is_management: boolean
  max_open_tasks: number
}

type AuthState = {
  session: Session | null
  profile: Profile | null
  role: Role | null
  capabilities: Set<string>
  isLoading: boolean
  hasCapability: (cap: string) => boolean
  isCeo: boolean
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

async function loadCapabilities(profileId: string, roleId: string): Promise<Set<string>> {
  // Secondary positions ("Qo'shimcha lavozimlar") now grant their role's
  // capabilities too, same as the primary role -- see migration 0064.
  const { data: secondaryRoleRows } = await supabase
    .from('employee_roles')
    .select('role_id')
    .eq('profile_id', profileId)
  const roleIds = [roleId, ...(secondaryRoleRows ?? []).map((r) => r.role_id)]

  const { data: capRows } = await supabase
    .from('role_capabilities')
    .select('capability')
    .in('role_id', roleIds)

  const effective = new Set((capRows ?? []).map((c) => c.capability))

  const { data: overrideRows } = await supabase
    .from('profile_capability_overrides')
    .select('capability, granted')
    .eq('profile_id', profileId)

  for (const o of overrideRows ?? []) {
    if (o.granted) effective.add(o.capability)
    else effective.delete(o.capability)
  }

  return effective
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [sessionChecked, setSessionChecked] = useState(false)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [role, setRole] = useState<Role | null>(null)
  const [capabilities, setCapabilities] = useState<Set<string>>(new Set())
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setSessionChecked(true)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
      setSessionChecked(true)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    // Wait for the real session lookup (localStorage/network) before deciding
    // there's no user — otherwise the initial `session === null` default state
    // races ahead and flashes the login page before we've actually checked.
    if (!sessionChecked) return

    let cancelled = false

    async function loadProfile() {
      if (!session?.user) {
        setProfile(null)
        setRole(null)
        setCapabilities(new Set())
        setIsLoading(false)
        return
      }

      // Supabase silently refreshes the access token in the background
      // (token rotation, tab-focus revalidation, etc.), which fires this
      // effect again with a new `session` object for the SAME user. Only
      // show the splash for a genuine login (no profile loaded yet) —
      // not for every background token refresh.
      if (!profile) setIsLoading(true)

      const { data: profileRow } = await supabase
        .from('profiles')
        .select('id, full_name, role_id, avatar_url')
        .eq('auth_user_id', session.user.id)
        .single()

      if (cancelled) return

      if (!profileRow) {
        setProfile(null)
        setRole(null)
        setCapabilities(new Set())
        setIsLoading(false)
        return
      }

      setProfile(profileRow)

      const { data: roleRow } = await supabase
        .from('roles')
        .select('id, slug, label_ru, label_uz, is_management, max_open_tasks')
        .eq('id', profileRow.role_id)
        .single()

      if (cancelled) return
      setRole(roleRow)

      const effective = await loadCapabilities(profileRow.id, profileRow.role_id)
      if (cancelled) return
      setCapabilities(effective)
      setIsLoading(false)
    }

    loadProfile()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id, sessionChecked])

  // The CEO grants/revokes capabilities for OTHER employees from the Team
  // page, from a different browser session than the one being changed --
  // so the change can't just update local state, and nothing here pushes
  // it to the affected employee's already-open tab. Without this, a grant
  // only took effect after the employee logged out and back in, which
  // read as "permissions don't work" even though the write succeeded.
  // Realtime push (not polling) -- the affected row's own INSERT/UPDATE/
  // DELETE on profile_capability_overrides OR employee_roles (secondary
  // positions now grant their role's capabilities too, see migration 0064)
  // triggers an instant recheck.
  useEffect(() => {
    if (!profile) return

    async function refresh() {
      if (!profile) return
      const effective = await loadCapabilities(profile.id, profile.role_id)
      setCapabilities(effective)
    }

    const channel = supabase
      .channel(`capability-overrides-${profile.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'profile_capability_overrides',
          filter: `profile_id=eq.${profile.id}`,
        },
        refresh
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'employee_roles',
          filter: `profile_id=eq.${profile.id}`,
        },
        refresh
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [profile])

  const hasCapability = (cap: string) => capabilities.has(cap)
  const isCeo = role?.slug === 'ceo'

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  // Lets an upload flow (e.g. changing one's own avatar) refresh the cached
  // profile without a full page reload or re-running the whole capability
  // fetch chain above.
  const refreshProfile = async () => {
    if (!session?.user) return
    const { data: profileRow } = await supabase
      .from('profiles')
      .select('id, full_name, role_id, avatar_url')
      .eq('auth_user_id', session.user.id)
      .single()
    if (profileRow) setProfile(profileRow)
  }

  return (
    <AuthContext.Provider
      value={{ session, profile, role, capabilities, isLoading, hasCapability, isCeo, signOut, refreshProfile }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
