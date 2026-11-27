import { Link, NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/context'

const NAV = [
  { to: '/#services', label: 'Services' },
  { to: '/#tracker', label: 'Track a request' },
  { to: '/transparency', label: 'Transparency' },
  { to: '/#projects', label: 'Projects' },
  { to: '/#faq', label: 'FAQ' },
]

export default function PublicLayout() {
  const { session, isStaff } = useAuth()

  return (
    <div className="d-flex flex-column min-vh-100">
      <header className="site-header">
        <div className="container site-header-inner">
          <Link to="/" className="brand">
            <img src="/images/talampas-logo.png" alt="Barangay Talampas seal" />
            <span>
              <span className="brand-name d-block">OneSitio</span>
              <span className="brand-sub d-none d-sm-block">Barangay Talampas, Bustos, Bulacan</span>
            </span>
          </Link>

          <nav className="site-nav" aria-label="Main">
            {NAV.map((n) =>
              n.to.includes('#') ? (
                <Link key={n.to} to={n.to}>{n.label}</Link>
              ) : (
                <NavLink key={n.to} to={n.to}>{n.label}</NavLink>
              ),
            )}
          </nav>

          <div className="d-flex align-items-center gap-2">
            {session ? (
              <Link to={isStaff ? '/staff' : '/app'} className="btn btn-ink btn-sm">
                Open workspace <i className="bi bi-arrow-right"></i>
              </Link>
            ) : (
              <>
                <Link to="/login" className="btn btn-ghost btn-sm">Log in</Link>
                <Link to="/register" className="btn btn-ink btn-sm">Register</Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="flex-grow-1">
        <Outlet />
      </main>

      <footer className="site-footer">
        <div className="container">
          <div className="row g-4">
            <div className="col-lg-4">
              <Link to="/" className="brand mb-3">
                <img src="/images/talampas-logo.png" alt="" />
                <span className="brand-name">OneSitio</span>
              </Link>
              <p className="mb-0" style={{ maxWidth: 340 }}>
                Online barangay services and a public, tamper-evident record of how Barangay Talampas uses its funds.
              </p>
            </div>
            <div className="col-6 col-lg-2">
              <h4>Services</h4>
              <ul>
                <li><Link to="/#services">Documents</Link></li>
                <li><Link to="/#tracker">Track a request</Link></li>
                <li><Link to="/register">Register</Link></li>
                <li><Link to="/login">Log in</Link></li>
              </ul>
            </div>
            <div className="col-6 col-lg-2">
              <h4>Transparency</h4>
              <ul>
                <li><Link to="/transparency">Public ledger</Link></li>
                <li><Link to="/#projects">Projects</Link></li>
                <li><Link to="/#faq">FAQ</Link></li>
              </ul>
            </div>
            <div className="col-lg-4">
              <h4>Barangay Hall</h4>
              <ul>
                <li>Barangay Talampas, Bustos, Bulacan 3007</li>
                <li>Monday – Friday, 8:00 AM – 5:00 PM</li>
              </ul>
            </div>
          </div>
          <div className="footer-bottom">
            <span>© 2026 OneSitio · Sangguniang Barangay ng Talampas</span>
            <span>A student project inspired by the CADENA Act (SB 1506). Not an official government service.</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
