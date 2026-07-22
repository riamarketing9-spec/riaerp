import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'

export function RequireCapability({
  anyOf,
  children,
}: {
  anyOf: string[]
  children: ReactNode
}) {
  const { hasCapability } = useAuth()
  // Deliberately NOT using isCeo here: isCeo is role-slug-based
  // (role?.slug === 'ceo'), while every route's RLS underneath is
  // capability-based (is_ceo() = has_capability('org.full_access')). Any
  // route meant to be CEO-only already lists 'org.full_access' in anyOf, so
  // gating on isCeo instead would let a role-slug 'ceo' account bypass
  // every guarded route even after org.full_access was revoked via an
  // override, and vice versa block a genuine override-granted CEO.
  const allowed = anyOf.some((cap) => hasCapability(cap))
  if (!allowed) return <Navigate to="/cabinet" replace />
  return <>{children}</>
}
