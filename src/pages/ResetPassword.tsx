import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../auth/context'
import { errMsg } from '../lib/format'
import { PageLoader } from '../components/ui'

export default function ResetPassword() {
  const { session, loading } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  if (loading) return <PageLoader />

  if (!session) {
    return (
      <div className="container py-5 text-center" style={{ maxWidth: 520 }}>
        <h1 className="h4">Reset link expired</h1>
        <p className="text-muted">Request a new link from the login page.</p>
        <Link to="/login" className="btn btn-ink">Back to login</Link>
      </div>
    )
  }

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (password.length < 8) return setError('At least 8 characters.')
    if (password !== confirm) return setError('Passwords don’t match.')
    setSaving(true)
    const { error: err } = await supabase.auth.updateUser({ password })
    setSaving(false)
    if (err) return setError(errMsg(err))
    navigate('/app', { replace: true })
  }

  return (
    <div className="container py-5" style={{ maxWidth: 460 }}>
      <div className="panel">
        <h1 className="h4 mb-3">Set a new password</h1>
        <form onSubmit={save} className="d-grid gap-3">
          <div>
            <label className="form-label">New password</label>
            <input type="password" className="form-control" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
          </div>
          <div>
            <label className="form-label">Confirm password</label>
            <input type="password" className="form-control" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
          </div>
          {error && <div className="field-error">{error}</div>}
          <button className="btn btn-ink" disabled={saving}>Save password</button>
        </form>
      </div>
    </div>
  )
}
