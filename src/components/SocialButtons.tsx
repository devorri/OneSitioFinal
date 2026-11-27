import { useState } from 'react'
import { signInWithProvider, type OAuthProvider } from '../lib/oauth'
import { errMsg } from '../lib/format'

export default function SocialButtons({ googleLabel, facebookLabel }: { googleLabel: string; facebookLabel: string }) {
  const [busy, setBusy] = useState<OAuthProvider | null>(null)
  const [error, setError] = useState('')

  const go = async (p: OAuthProvider) => {
    setError('')
    setBusy(p)
    try {
      await signInWithProvider(p) // browser redirects away on success
    } catch (e) {
      setError(errMsg(e))
      setBusy(null)
    }
  }

  return (
    <div className="d-grid gap-2">
      <button type="button" className="btn btn-line social-btn" onClick={() => go('google')} disabled={!!busy}>
        {busy === 'google' ? <span className="spinner-border spinner-border-sm" aria-hidden="true"></span> : <i className="bi bi-google" style={{ color: '#4285F4' }}></i>}
        {googleLabel}
      </button>
      <button type="button" className="btn btn-line social-btn" onClick={() => go('facebook')} disabled={!!busy}>
        {busy === 'facebook' ? <span className="spinner-border spinner-border-sm" aria-hidden="true"></span> : <i className="bi bi-facebook" style={{ color: '#1877F2' }}></i>}
        {facebookLabel}
      </button>
      {error && <div className="field-error text-center">{error}</div>}
    </div>
  )
}
