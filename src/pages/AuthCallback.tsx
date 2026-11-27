import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../auth/context'
import { rememberAccount } from '../lib/recent'
import { fullName } from '../lib/format'
import { PageLoader } from '../components/ui'

/** Landing page after Google / Facebook sign-in or email confirmation. */
export default function AuthCallback() {
  const { session, profile, isStaff, loading } = useAuth()
  const [timedOut, setTimedOut] = useState(false)

  const params = new URLSearchParams(window.location.hash.slice(1) || window.location.search)
  const urlError = params.get('error_description')

  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), 8000)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    if (session && profile?.email) {
      rememberAccount({ email: profile.email, name: fullName(profile) || profile.email, staff: profile.role !== 'resident', avatar: profile.avatar_url })
    }
  }, [session, profile])

  if (session && !loading) return <Navigate to={isStaff ? '/staff' : '/app'} replace />

  if (urlError || timedOut) {
    return (
      <div className="container py-5 text-center" style={{ maxWidth: 520 }}>
        <i className="bi bi-exclamation-circle fs-2"></i>
        <h1 className="h4 mt-3">Couldn’t sign you in</h1>
        <p className="text-muted">{urlError || 'The sign-in link may have expired. Please try again.'}</p>
        <Link to="/login" className="btn btn-ink">Back to login</Link>
      </div>
    )
  }

  return <PageLoader label="Signing you in…" />
}
