import { useEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import PublicLayout from './layouts/PublicLayout'
import AppLayout from './layouts/AppLayout'
import { RequireAuth, RequireStaff } from './auth/guards'
import Home from './pages/Home'
import Transparency from './pages/Transparency'
import Login from './pages/Login'
import Register from './pages/Register'
import AuthCallback from './pages/AuthCallback'
import ResetPassword from './pages/ResetPassword'
import NotFound from './pages/NotFound'
import Dashboard from './pages/app/Dashboard'
import RequestDocument from './pages/app/RequestDocument'
import MyRequests from './pages/app/MyRequests'
import RequestDetail from './pages/app/RequestDetail'
import Household from './pages/app/Household'
import Profile from './pages/app/Profile'
import StaffDashboard from './pages/staff/StaffDashboard'
import Residents from './pages/staff/Residents'
import Requests from './pages/staff/Requests'
import Ledger from './pages/staff/Ledger'
import Projects from './pages/staff/Projects'

// "/#services"-style links: scroll to the section, or to the top on a normal page change.
function ScrollToHash() {
  const { pathname, hash } = useLocation()

  useEffect(() => {
    if (hash && !hash.includes('access_token')) {
      const el = document.getElementById(hash.slice(1))
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' })
        return
      }
    }
    window.scrollTo(0, 0)
  }, [pathname, hash])

  return null
}

export default function App() {
  return (
    <>
      <ScrollToHash />
      <Routes>
        <Route element={<PublicLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/transparency" element={<Transparency />} />
          <Route path="/register" element={<Register />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="*" element={<NotFound />} />
        </Route>

        <Route path="/login" element={<Login />} />
        <Route path="/auth/callback" element={<AuthCallback />} />

        <Route path="/app" element={<RequireAuth><AppLayout variant="resident" /></RequireAuth>}>
          <Route index element={<Dashboard />} />
          <Route path="request" element={<RequestDocument />} />
          <Route path="requests" element={<MyRequests />} />
          <Route path="requests/:id" element={<RequestDetail />} />
          <Route path="household" element={<Household />} />
          <Route path="profile" element={<Profile />} />
        </Route>

        <Route path="/staff" element={<RequireStaff><AppLayout variant="staff" /></RequireStaff>}>
          <Route index element={<StaffDashboard />} />
          <Route path="residents" element={<Residents />} />
          <Route path="requests" element={<Requests />} />
          <Route path="ledger" element={<Ledger />} />
          <Route path="projects" element={<Projects />} />
        </Route>

        <Route path="/resident" element={<Navigate to="/app" replace />} />
      </Routes>
    </>
  )
}
