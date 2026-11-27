import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { profileIncomplete, useAuth } from './context'
import { PageLoader } from '../components/ui'

export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, profile, loading } = useAuth()
  const location = useLocation()

  if (loading) return <PageLoader />
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (profileIncomplete(profile) && location.pathname !== '/app/profile') {
    return <Navigate to="/app/profile?setup=1" replace />
  }
  return <>{children}</>
}

export function RequireStaff({ children }: { children: ReactNode }) {
  const { session, isStaff, loading } = useAuth()
  const location = useLocation()

  if (loading) return <PageLoader />
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (!isStaff) return <Navigate to="/app" replace />
  return <>{children}</>
}
