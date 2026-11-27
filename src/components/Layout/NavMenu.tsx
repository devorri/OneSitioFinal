import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import './NavMenu.css'

const links = [
  { to: '/', label: 'Home', icon: 'bi-house-door-fill-nav-menu', end: true },
  { to: '/counter', label: 'Counter', icon: 'bi-plus-square-fill-nav-menu', end: false },
  { to: '/weather', label: 'Weather', icon: 'bi-list-nested-nav-menu', end: false },
]

export default function NavMenu() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <div className="top-row ps-3 navbar navbar-dark">
        <div className="container-fluid">
          <NavLink className="navbar-brand" to="/">BamAquinoProject</NavLink>
        </div>
      </div>

      <input
        type="checkbox"
        title="Navigation menu"
        className="navbar-toggler"
        checked={open}
        onChange={(e) => setOpen(e.target.checked)}
      />

      <div className="nav-scrollable" onClick={() => setOpen(false)}>
        <nav className="flex-column">
          {links.map((l) => (
            <div className="nav-item px-3" key={l.to}>
              <NavLink className="nav-link" to={l.to} end={l.end}>
                <span className={`bi ${l.icon}`} aria-hidden="true"></span> {l.label}
              </NavLink>
            </div>
          ))}
        </nav>
      </div>
    </>
  )
}
