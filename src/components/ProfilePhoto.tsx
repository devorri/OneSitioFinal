import { useRef, useState } from 'react'
import { supabase } from '../supabaseClient'
import { deleteAvatarFile, uploadAvatar } from '../lib/avatar'
import { errMsg, fullName } from '../lib/format'
import type { Profile } from '../lib/types'
import Avatar from './Avatar'

export default function ProfilePhoto({ profile, onSaved }: { profile: Profile; onSaved: () => Promise<void> }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const name = fullName(profile) || profile.email || ''
  const hasPhoto = !!profile.avatar_url

  const pick = () => inputRef.current?.click()

  const save = async (url: string | null) => {
    const old = profile.avatar_url
    const { error: e } = await supabase.from('profiles').update({ avatar_url: url }).eq('id', profile.id)
    if (e) throw e
    await deleteAvatarFile(old)
    await onSaved()
  }

  const onFile = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    setError('')
    try {
      await save(await uploadAvatar(profile.id, file))
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const remove = async () => {
    setBusy(true)
    setError('')
    try {
      await save(null)
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="panel">
      <div className="panel-head"><h2>Profile photo</h2></div>
      <div className="photo-edit">
        <button type="button" className="photo-drop border-0 bg-transparent p-0" onClick={pick} disabled={busy} aria-label="Change profile photo">
          <Avatar url={profile.avatar_url} name={name} size={88} />
          <span className="photo-badge">
            {busy ? <span className="spinner-border spinner-border-sm" aria-hidden="true"></span> : <i className="bi bi-camera-fill"></i>}
          </span>
        </button>
        <div>
          <div className="d-flex flex-wrap gap-2">
            <button type="button" className="btn btn-line btn-sm" onClick={pick} disabled={busy}>
              {hasPhoto ? 'Change photo' : 'Upload photo'}
            </button>
            {hasPhoto && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={remove} disabled={busy}>Remove</button>
            )}
          </div>
          <div className="form-text mt-2">JPG or PNG, cropped to a square. This is your display photo — your ID selfie stays separate and private.</div>
          {error && <div className="field-error">{error}</div>}
        </div>
      </div>
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={(e) => onFile(e.target.files?.[0])} />
    </div>
  )
}
