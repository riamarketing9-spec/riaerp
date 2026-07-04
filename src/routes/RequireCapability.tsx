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
  const { hasCapability, isCeo } = useAuth()
  const allowed = isCeo || anyOf.some((cap) => hasCapability(cap))
  if (!allowed) return <Navigate to="/cabinet" replace />
  return <>{children}</>
}
