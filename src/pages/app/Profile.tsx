import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import { profileIncomplete, useAuth } from '../../auth/context'
import { usePageTitle } from '../../usePageTitle'
import { CIVIL_STATUSES, ID_TYPES, PUROKS, ageFrom, errMsg, fmtDateTime } from '../../lib/format'
import { extOf, signedUrl, uploadResidentFile } from '../../lib/storage'
import type { Profile as ProfileT } from '../../lib/types'
import { PageLoader, VerificationPill } from '../../components/ui'
import IdScanner from '../../components/IdScanner'
import { addressToForm } from '../../lib/idParser'
import type { OcrResult } from '../../lib/ocr'
import SelfieCapture from '../../components/SelfieCapture'
import ProfilePhoto from '../../components/ProfilePhoto'

type Details = Pick<ProfileT, 'first_name' | 'last_name' | 'civil_status' | 'purok'> & {
  middle_name: string
  suffix: string
  birth_date: string
  mobile: string
  street_address: string
}

function toDetails(p: ProfileT): Details {
  return {
    first_name: p.first_name ?? '',
    middle_name: p.middle_name ?? '',
    last_name: p.last_name ?? '',
    suffix: p.suffix ?? '',
    birth_date: p.birth_date ?? '',
    civil_status: p.civil_status ?? 'Single',
    mobile: p.mobile ?? '',
    purok: p.purok ?? PUROKS[0],
    street_address: p.street_address ?? '',
  }
}

export default function Profile() {
  usePageTitle('Profile & ID • OneSitio')
  const { profile, user, refreshProfile } = useAuth()
  const [params] = useSearchParams()
  const navigate = useNavigate()

  if (!profile) return <PageLoader />
  return <ProfileForm key={profile.updated_at} profile={profile} providers={user?.app_metadata?.providers as string[] | undefined} setup={params.get('setup') === '1'} onSaved={refreshProfile} navigate={navigate} />
}

function ProfileForm({
  profile,
  providers,
  setup,
  onSaved,
  navigate,
}: {
  profile: ProfileT
  providers?: string[]
  setup: boolean
  onSaved: () => Promise<void>
  navigate: ReturnType<typeof useNavigate>
}) {
  const [d, setD] = useState<Details>(() => toDetails(profile))
  const [savingDetails, setSavingDetails] = useState(false)
  const [detailsMsg, setDetailsMsg] = useState('')
  const [detailsErr, setDetailsErr] = useState('')

  const [idType, setIdType] = useState(profile.id_type ?? ID_TYPES[0])
  const [idNumber, setIdNumber] = useState(profile.id_number ?? '')
  const [idFile, setIdFile] = useState<File | null>(null)
  const [ocrText, setOcrText] = useState('')
  const [scanNote, setScanNote] = useState<{ filled: number; nameMismatch: boolean } | null>(null)
  const [selfie, setSelfie] = useState<Blob | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [verifyErr, setVerifyErr] = useState('')

  const [idUrl, setIdUrl] = useState<string | null>(null)
  const [selfieUrl, setSelfieUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([signedUrl(profile.id_image_path), signedUrl(profile.selfie_path)]).then(([a, b]) => {
      if (cancelled) return
      setIdUrl(a)
      setSelfieUrl(b)
    })
    return () => {
      cancelled = true
    }
  }, [profile.id_image_path, profile.selfie_path])

  const set = <K extends keyof Details>(k: K, v: Details[K]) => setD((x) => ({ ...x, [k]: v }))
  const locked = profile.verification_status === 'verified' || profile.verification_status === 'pending'
  const incomplete = profileIncomplete(profile)
  const canSubmitId = profile.verification_status === 'unverified' || profile.verification_status === 'rejected'

  /** Use the ID to fill empty personal fields (never overwrites what's already there). */
  const applyScan = (r: OcrResult) => {
    const p = r.parsed
    setOcrText(r.text.slice(0, 4000))
    if (p.idNumber && !idNumber.trim()) setIdNumber(p.idNumber)
    const addr = addressToForm(p.address, PUROKS)
    let filled = 0
    if (!locked) {
      const incoming: Partial<Details> = {
        first_name: p.firstName,
        middle_name: p.middleName,
        last_name: p.lastName,
        suffix: p.suffix,
        birth_date: p.birthDate,
        street_address: addr.street,
      }
      const patch: Partial<Details> = {}
      for (const [k, v] of Object.entries(incoming) as [keyof Details, string][]) {
        if (v && !String(d[k] ?? '').trim()) {
          patch[k] = v
          filled++
        }
      }
      if (addr.purok && !profile.purok) {
        patch.purok = addr.purok
        filled++
      }
      if (filled) setD((x) => ({ ...x, ...patch }))
    }
    const norm = (s: string) => s.toUpperCase().replace(/[^A-ZÑ]/g, '')
    const nameMismatch =
      !!(p.firstName || p.lastName) &&
      !!(d.first_name || d.last_name) &&
      (norm(p.lastName) !== norm(d.last_name) || !norm(p.firstName).includes(norm(d.first_name.split(' ')[0] ?? '')))
    setScanNote({ filled, nameMismatch })
  }

  const saveDetails = async (e: FormEvent) => {
    e.preventDefault()
    setDetailsErr('')
    setDetailsMsg('')
    if (!d.first_name.trim() || !d.last_name.trim()) return setDetailsErr('First and last name are required.')
    if (!d.birth_date) return setDetailsErr('Birth date is required.')
    const age = ageFrom(d.birth_date)
    if (age !== null && age < 15) return setDetailsErr('Residents must be at least 15 years old.')
    setSavingDetails(true)
    const patch: Partial<ProfileT> = {
      civil_status: d.civil_status,
      mobile: d.mobile.trim() || null,
      purok: d.purok,
      street_address: d.street_address.trim() || null,
    }
    if (!locked) {
      Object.assign(patch, {
        first_name: d.first_name.trim(),
        middle_name: d.middle_name.trim() || null,
        last_name: d.last_name.trim(),
        suffix: d.suffix.trim() || null,
        birth_date: d.birth_date,
      })
    }
    const { error } = await supabase.from('profiles').update(patch).eq('id', profile.id)
    setSavingDetails(false)
    if (error) return setDetailsErr(errMsg(error))
    setDetailsMsg('Saved.')
    await onSaved()
    if (setup) navigate('/app/profile', { replace: true })
  }

  const submitId = async () => {
    setVerifyErr('')
    if (incomplete) return setVerifyErr('Save your personal details first.')
    if (!idFile) return setVerifyErr('Upload a photo of your ID.')
    if (!selfie) return setVerifyErr('Take or upload a selfie.')
    setSubmitting(true)
    try {
      const idPath = await uploadResidentFile(profile.id, 'id', idFile, extOf(idFile))
      const selfiePath = await uploadResidentFile(profile.id, 'selfie', selfie, 'jpg')
      const { error } = await supabase
        .from('profiles')
        .update({
          id_type: idType,
          id_number: idNumber.trim() || null,
          id_image_path: idPath,
          selfie_path: selfiePath,
          ocr_text: ocrText.slice(0, 4000) || null,
          verification_status: 'pending',
        })
        .eq('id', profile.id)
      if (error) throw error
      await onSaved()
    } catch (e) {
      setVerifyErr(errMsg(e))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{setup || incomplete ? 'Complete your profile' : 'Profile & ID'}</h1>
          <p className="page-sub">
            {setup || incomplete ? 'Add your address and birth date so the barangay can verify you.' : 'Your personal details and ID verification.'}
          </p>
        </div>
        <VerificationPill status={profile.verification_status} />
      </div>

      <div className="row g-3">
        <div className="col-lg-7">
          <form className="panel" onSubmit={saveDetails}>
            <div className="panel-head">
              <h2>Personal details</h2>
              {locked && <span className="small text-muted"><i className="bi bi-lock me-1"></i>Name & birth date locked after verification</span>}
            </div>
            <div className="row g-3">
              <div className="col-md-6">
                <label className="form-label">First name</label>
                <input className="form-control" value={d.first_name} onChange={(e) => set('first_name', e.target.value)} disabled={locked} />
              </div>
              <div className="col-md-6">
                <label className="form-label">Middle name</label>
                <input className="form-control" value={d.middle_name} onChange={(e) => set('middle_name', e.target.value)} disabled={locked} />
              </div>
              <div className="col-md-8">
                <label className="form-label">Last name</label>
                <input className="form-control" value={d.last_name} onChange={(e) => set('last_name', e.target.value)} disabled={locked} />
              </div>
              <div className="col-md-4">
                <label className="form-label">Suffix</label>
                <input className="form-control" value={d.suffix} onChange={(e) => set('suffix', e.target.value)} disabled={locked} />
              </div>
              <div className="col-md-6">
                <label className="form-label">Birth date</label>
                <input type="date" className="form-control" value={d.birth_date} onChange={(e) => set('birth_date', e.target.value)} disabled={locked} max={new Date().toISOString().slice(0, 10)} />
              </div>
              <div className="col-md-6">
                <label className="form-label">Civil status</label>
                <select className="form-select" value={d.civil_status ?? 'Single'} onChange={(e) => set('civil_status', e.target.value)}>
                  {CIVIL_STATUSES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="col-md-6">
                <label className="form-label">Mobile number</label>
                <input type="tel" className="form-control" value={d.mobile} onChange={(e) => set('mobile', e.target.value)} placeholder="0917 123 4567" />
              </div>
              <div className="col-md-6">
                <label className="form-label">Purok / Sitio</label>
                <select className="form-select" value={d.purok ?? PUROKS[0]} onChange={(e) => set('purok', e.target.value)}>
                  {PUROKS.map((p) => <option key={p}>{p}</option>)}
                </select>
              </div>
              <div className="col-12">
                <label className="form-label">House no. / street</label>
                <input className="form-control" value={d.street_address} onChange={(e) => set('street_address', e.target.value)} />
              </div>
            </div>
            <div className="d-flex align-items-center gap-3 mt-4">
              <button className="btn btn-ink" disabled={savingDetails}>
                {savingDetails && <span className="spinner-border spinner-border-sm" aria-hidden="true"></span>}
                Save details
              </button>
              {detailsMsg && <span className="small" style={{ color: 'var(--ok)' }}>{detailsMsg}</span>}
              {detailsErr && <span className="field-error m-0">{detailsErr}</span>}
            </div>
          </form>
        </div>

        <div className="col-lg-5 d-grid gap-3 align-content-start">
          <ProfilePhoto profile={profile} onSaved={onSaved} />

          <div className="panel">
            <div className="panel-head"><h2>Account</h2></div>
            <dl className="kv" style={{ gridTemplateColumns: '110px 1fr', fontSize: '0.9rem' }}>
              <dt>Resident ID</dt><dd className="mono">{profile.resident_code}</dd>
              <dt>Email</dt><dd>{profile.email}</dd>
              <dt>Sign-in</dt><dd className="text-capitalize">{(providers ?? ['email']).join(', ')}</dd>
              <dt>Member since</dt><dd>{fmtDateTime(profile.created_at)}</dd>
            </dl>
          </div>

          {!canSubmitId && (
            <div className="panel">
              <div className="panel-head">
                <h2>ID verification</h2>
                <VerificationPill status={profile.verification_status} />
              </div>
              <dl className="kv mb-3" style={{ gridTemplateColumns: '110px 1fr', fontSize: '0.9rem' }}>
                <dt>ID type</dt><dd>{profile.id_type || '—'}</dd>
                <dt>ID number</dt><dd className="mono">{profile.id_number || '—'}</dd>
                {profile.verified_at && (<><dt>Verified</dt><dd>{fmtDateTime(profile.verified_at)}</dd></>)}
              </dl>
              <div className="row g-2">
                <div className="col-6"><div className="media-frame" style={{ minHeight: 120 }}>{idUrl ? <img src={idUrl} alt="Your ID" /> : <span className="small text-muted">ID</span>}</div></div>
                <div className="col-6"><div className="media-frame" style={{ minHeight: 120 }}>{selfieUrl ? <img src={selfieUrl} alt="Your selfie" /> : <span className="small text-muted">Selfie</span>}</div></div>
              </div>
            </div>
          )}
        </div>

        {canSubmitId && (
          <div className="col-12">
            <div className="panel">
              <div className="panel-head">
                <h2>Verify your identity</h2>
                <span className="small text-muted">Only the Barangay Secretary can see these files.</span>
              </div>

              {profile.verification_status === 'rejected' && profile.verification_note && (
                <div className="note note-bad mb-3">
                  <i className="bi bi-exclamation-circle"></i>
                  <span>Previous submission was returned: {profile.verification_note}</span>
                </div>
              )}

              <div className="row g-4">
                <div className="col-lg-7 d-grid gap-3 align-content-start">
                  <div style={{ maxWidth: 380 }}>
                    <label className="form-label">ID type</label>
                    <select className="form-select" value={idType} onChange={(e) => setIdType(e.target.value)}>
                      {ID_TYPES.map((t) => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <IdScanner file={idFile} onFile={setIdFile} onScanned={applyScan} />
                  <div style={{ maxWidth: 380 }}>
                    <label className="form-label">ID number</label>
                    <input className="form-control mono" value={idNumber} onChange={(e) => setIdNumber(e.target.value)} placeholder="Filled in after reading your ID" />
                  </div>
                  {scanNote && scanNote.filled > 0 && (
                    <div className="note py-2">
                      <i className="bi bi-magic"></i>
                      <span>We filled {scanNote.filled} empty field{scanNote.filled > 1 ? 's' : ''} in <strong>Personal details</strong> from your ID. Check them and click <strong>Save details</strong>.</span>
                    </div>
                  )}
                  {scanNote?.nameMismatch && (
                    <div className="note note-warn py-2">
                      <i className="bi bi-exclamation-circle"></i>
                      <span>The name on your ID doesn’t match your profile name. Make sure both are correct — the secretary will compare them.</span>
                    </div>
                  )}
                </div>
                <div className="col-lg-5">
                  <label className="form-label">Selfie</label>
                  <SelfieCapture value={selfie} onChange={setSelfie} />
                </div>
              </div>

              <div className="d-flex align-items-center gap-3 mt-4 pt-3 border-top">
                <button type="button" className="btn btn-ink" onClick={submitId} disabled={submitting}>
                  {submitting && <span className="spinner-border spinner-border-sm" aria-hidden="true"></span>}
                  Submit for verification
                </button>
                {verifyErr && <span className="field-error m-0">{verifyErr}</span>}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
