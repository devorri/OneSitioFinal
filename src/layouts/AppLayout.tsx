import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/context'
import { supabase } from '../supabaseClient'
import { fullName } from '../lib/format'
import Avatar from '../components/Avatar'

interface NavItem {
  to: string
  label: string
  icon: string
  end?: boolean
  count?: number
}

export default function AppLayout({ variant }: { variant: 'resident' | 'staff' }) {
  const { profile, isStaff, signOut } = useAuth()
  const navigate = useNavigate()
  const [counts, setCounts] = useState({ verifications: 0, requests: 0 })

  useEffect(() => {
    if (variant !== 'staff') return
    let cancelled = false
    Promise.all([
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('verification_status', 'pending'),
      supabase.from('document_requests').select('id', { count: 'exact', head: true }).in('status', ['pending', 'under_review']),
    ]).then(([v, r]) => {
      if (!cancelled) setCounts({ verifications: v.count ?? 0, requests: r.count ?? 0 })
    })
    return () => {
      cancelled = true
    }
  }, [variant])

  const residentNav: NavItem[] = [
    { to: '/app', label: 'Overview', icon: 'bi-house', end: true },
    { to: '/app/request', label: 'Request a document', icon: 'bi-file-earmark-plus' },
    { to: '/app/requests', label: 'My requests', icon: 'bi-list-check' },
    { to: '/app/household', label: 'Household', icon: 'bi-people' },
    { to: '/app/profile', label: 'Profile & ID', icon: 'bi-person-badge' },
  ]

  const staffNav: NavItem[] = [
    { to: '/staff', label: 'Overview', icon: 'bi-speedometer2', end: true },
    { to: '/staff/residents', label: 'Resident verification', icon: 'bi-person-check', count: counts.verifications },
    { to: '/staff/requests', label: 'Document requests', icon: 'bi-inboxes', count: counts.requests },
    { to: '/staff/ledger', label: 'Ledger', icon: 'bi-link-45deg' },
    { to: '/staff/projects', label: 'Projects', icon: 'bi-cone-striped' },
  ]

  const nav = variant === 'staff' ? staffNav : residentNav
  const name = fullName(profile) || profile?.email || 'Account'

  const logout = async () => {
    await signOut()
    navigate('/login')
  }

  const links = (
    <>
      {nav.map((n) => (
        <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `side-link ${isActive ? 'active' : ''}`}>
          <i className={`bi ${n.icon}`}></i>
          {n.label}
          {!!n.count && <span className="side-count">{n.count}</span>}
        </NavLink>
      ))}
    </>
  )

  return (
    <div className="app-shell">
      <aside className="app-side">
        <Link to="/" className="brand px-2">
          <img src="/images/talampas-logo.png" alt="" />
          <span>
            <span className="brand-name d-block">OneSitio</span>
            <span className="brand-sub">{variant === 'staff' ? 'Staff portal' : 'Resident workspace'}</span>
          </span>
        </Link>

        <nav className="side-section">{links}</nav>

        <div className="side-section">
          <div className="side-label">Public</div>
          <Link to="/transparency" className="side-link"><i className="bi bi-shield-check"></i>Transparency</Link>
          {isStaff && variant === 'resident' && (
            <Link to="/staff" className="side-link"><i className="bi bi-building"></i>Staff portal</Link>
          )}
          {variant === 'staff' && (
            <Link to="/app" className="side-link"><i className="bi bi-person"></i>Resident view</Link>
          )}
        </div>

        <div className="mt-auto d-flex align-items-center gap-2 px-2">
          <Avatar url={profile?.avatar_url} name={name} />
          <div className="flex-grow-1 min-w-0" style={{ minWidth: 0 }}>
            <div className="small fw-semibold text-truncate">{name}</div>
            <div className="small text-muted text-truncate">{profile?.resident_code}</div>
          </div>
          <button type="button" className="icon-btn" onClick={logout} title="Sign out" aria-label="Sign out">
            <i className="bi bi-box-arrow-right"></i>
          </button>
        </div>
      </aside>

      <div className="app-main">
        <header className="app-top">
          <Link to="/" className="brand d-lg-none">
            <img src="/images/talampas-logo.png" alt="" />
            <span className="brand-name">OneSitio</span>
          </Link>
          <span className="eyebrow d-none d-lg-inline">{variant === 'staff' ? 'Barangay staff' : 'Barangay Talampas'}</span>
          <div className="d-flex align-items-center gap-2">
            <span className="small text-muted d-none d-md-inline">{profile?.email}</span>
            <button type="button" className="btn btn-line btn-sm d-lg-none" onClick={logout}>Sign out</button>
          </div>
        </header>
        <nav className="mobile-nav">{links}</nav>
        <div className="app-content">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
