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

      const { data: capRows } = await supabase
        .from('role_capabilities')
        .select('capability')
        .eq('role_id', profileRow.role_id)

      if (cancelled) return
      const effective = new Set((capRows ?? []).map((c) => c.capability))

      const { data: overrideRows } = await supabase
        .from('profile_capability_overrides')
        .select('capability, granted')
        .eq('profile_id', profileRow.id)

      if (cancelled) return
      for (const o of overrideRows ?? []) {
        if (o.granted) effective.add(o.capability)
        else effective.delete(o.capability)
      }

      setCapabilities(effective)
      setIsLoading(false)
    }

    loadProfile()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id, sessionChecked])

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
