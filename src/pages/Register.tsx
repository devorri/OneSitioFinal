import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { usePageTitle } from '../usePageTitle'
import { useAuth } from '../auth/context'
import { CIVIL_STATUSES, ID_TYPES, PUROKS, ageFrom, errMsg } from '../lib/format'
import { extOf, uploadResidentFile } from '../lib/storage'
import IdOcrField from '../components/IdOcrField'
import SelfieCapture from '../components/SelfieCapture'
import SocialButtons from '../components/SocialButtons'

const STEPS = ['Personal details', 'Valid ID', 'Selfie', 'Account']

interface Form {
  first_name: string
  middle_name: string
  last_name: string
  suffix: string
  birth_date: string
  civil_status: string
  mobile: string
  email: string
  purok: string
  street_address: string
  id_type: string
  id_number: string
  password: string
  confirm: string
  is_household_head: boolean
  consent: boolean
}

const EMPTY: Form = {
  first_name: '', middle_name: '', last_name: '', suffix: '', birth_date: '', civil_status: 'Single',
  mobile: '', email: '', purok: PUROKS[0], street_address: '', id_type: ID_TYPES[0], id_number: '',
  password: '', confirm: '', is_household_head: false, consent: false,
}

type Done = null | 'submitted' | 'confirm-email' | 'upload-failed'

export default function Register() {
  usePageTitle('Register • OneSitio')
  const { refreshProfile, profile } = useAuth()

  const [step, setStep] = useState(0)
  const [form, setForm] = useState<Form>(EMPTY)
  const [errors, setErrors] = useState<Partial<Record<keyof Form | 'id_file' | 'selfie', string>>>({})
  const [idFile, setIdFile] = useState<File | null>(null)
  const [ocrText, setOcrText] = useState('')
  const [selfie, setSelfie] = useState<Blob | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [done, setDone] = useState<Done>(null)

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }))
  const age = ageFrom(form.birth_date)

  const validate = (s: number) => {
    const e: typeof errors = {}
    if (s === 0) {
      if (!form.first_name.trim()) e.first_name = 'Required'
      if (!form.last_name.trim()) e.last_name = 'Required'
      if (!form.birth_date) e.birth_date = 'Required'
      else if (age !== null && age < 15) e.birth_date = 'You must be at least 15 years old'
      if (!/^(\+63|0)9\d{2}[\s-]?\d{3}[\s-]?\d{4}$/.test(form.mobile.trim())) e.mobile = 'Use a PH mobile number, e.g. 0917 123 4567'
      if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) e.email = 'Enter a valid email'
      if (!form.street_address.trim()) e.street_address = 'Required'
    }
    if (s === 1 && !idFile) e.id_file = 'Please upload a photo of your ID'
    if (s === 2 && !selfie) e.selfie = 'Please take or upload a selfie'
    if (s === 3) {
      if (form.password.length < 8) e.password = 'At least 8 characters'
      if (form.password !== form.confirm) e.confirm = 'Passwords don’t match'
      if (!form.consent) e.consent = 'Please agree to continue'
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const next = () => validate(step) && setStep((s) => s + 1)

  const submit = async () => {
    if (!validate(3)) return
    setSubmitting(true)
    setSubmitError('')
    try {
      const { data, error } = await supabase.auth.signUp({
        email: form.email.trim(),
        password: form.password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          data: {
            first_name: form.first_name.trim(),
            middle_name: form.middle_name.trim(),
            last_name: form.last_name.trim(),
            suffix: form.suffix.trim(),
            birth_date: form.birth_date,
            civil_status: form.civil_status,
            mobile: form.mobile.trim(),
            purok: form.purok,
            street_address: form.street_address.trim(),
            is_household_head: form.is_household_head,
            id_type: form.id_type,
            id_number: form.id_number.trim(),
            ocr_text: ocrText.slice(0, 4000),
          },
        },
      })
      if (error) throw error
      if (data.user && data.user.identities && data.user.identities.length === 0) {
        throw new Error('This email is already registered. Please log in instead.')
      }

      if (!data.session || !data.user) {
        setDone('confirm-email')
        return
      }

      try {
        const uid = data.user.id
        const idPath = idFile ? await uploadResidentFile(uid, 'id', idFile, extOf(idFile)) : null
        const selfiePath = selfie ? await uploadResidentFile(uid, 'selfie', selfie, 'jpg') : null
        const { error: upErr } = await supabase
          .from('profiles')
          .update({ id_image_path: idPath, selfie_path: selfiePath, verification_status: 'pending' })
          .eq('id', uid)
        if (upErr) throw upErr
        await refreshProfile()
        setDone('submitted')
      } catch {
        await refreshProfile()
        setDone('upload-failed')
      }
    } catch (e) {
      setSubmitError(errMsg(e))
    } finally {
      setSubmitting(false)
    }
  }

  const err = (k: keyof typeof errors) => errors[k] && <div className="field-error">{errors[k]}</div>

  if (done) {
    return (
      <div className="container py-5" style={{ maxWidth: 620 }}>
        <div className="panel text-center p-5">
          {done === 'confirm-email' ? (
            <>
              <i className="bi bi-envelope-check" style={{ fontSize: '2.2rem' }}></i>
              <h1 className="h3 mt-3">Check your email</h1>
              <p className="text-muted">
                We sent a confirmation link to <strong>{form.email}</strong>. After confirming, log in and upload your ID and selfie under <em>Profile &amp; ID</em> to get verified.
              </p>
              <Link to="/login" className="btn btn-ink mt-2">Go to login</Link>
            </>
          ) : (
            <>
              <i className="bi bi-check-circle" style={{ fontSize: '2.2rem', color: 'var(--ok)' }}></i>
              <h1 className="h3 mt-3">Account created</h1>
              {profile?.resident_code && <p className="mono mb-2">{profile.resident_code}</p>}
              <p className="text-muted">
                {done === 'submitted'
                  ? 'Your ID and selfie were sent to the Barangay Secretary for verification. You can request documents once you’re verified.'
                  : 'Your account is ready, but the ID upload didn’t finish. Please upload it again under Profile & ID.'}
              </p>
              <Link to={done === 'submitted' ? '/app' : '/app/profile'} className="btn btn-ink mt-2">
                Go to my workspace <i className="bi bi-arrow-right"></i>
              </Link>
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="container py-5" style={{ maxWidth: 820 }}>
      <div className="mb-4">
        <span className="eyebrow">Resident registration</span>
        <h1 className="mt-1 mb-1" style={{ fontSize: '1.9rem' }}>Gumawa ng OneSitio account</h1>
        <p className="text-muted mb-0">Para sa mga residente ng Barangay Talampas, edad 15 pataas.</p>
      </div>

      {step === 0 && (
        <div className="panel mb-3">
          <div className="row g-3 align-items-center">
            <div className="col-md-5">
              <div className="fw-medium">Mas mabilis gamit ang Google o Facebook</div>
              <div className="small text-muted">Kakailanganin mo pa ring ilagay ang address at mag-upload ng ID pagkatapos.</div>
            </div>
            <div className="col-md-7">
              <SocialButtons googleLabel="Sign up with Google" facebookLabel="Sign up with Facebook" />
            </div>
          </div>
        </div>
      )}

      <div className="panel">
        <div className="stepper mb-4">
          {STEPS.map((s, i) => (
            <div key={s} className={`stepper-item ${i < step ? 'done' : i === step ? 'current' : ''}`}>
              <div className="stepper-bar"></div>
              <div className="stepper-label">{i + 1}. {s}</div>
            </div>
          ))}
        </div>

        {step === 0 && (
          <div className="row g-3">
            <div className="col-md-4">
              <label className="form-label">First name</label>
              <input className="form-control" value={form.first_name} onChange={(e) => set('first_name', e.target.value)} autoComplete="given-name" />
              {err('first_name')}
            </div>
            <div className="col-md-3">
              <label className="form-label">Middle name <span className="text-muted">(optional)</span></label>
              <input className="form-control" value={form.middle_name} onChange={(e) => set('middle_name', e.target.value)} autoComplete="additional-name" />
            </div>
            <div className="col-md-3">
              <label className="form-label">Last name</label>
              <input className="form-control" value={form.last_name} onChange={(e) => set('last_name', e.target.value)} autoComplete="family-name" />
              {err('last_name')}
            </div>
            <div className="col-md-2">
              <label className="form-label">Suffix</label>
              <input className="form-control" value={form.suffix} onChange={(e) => set('suffix', e.target.value)} placeholder="Jr." />
            </div>

            <div className="col-md-4">
              <label className="form-label">Birth date</label>
              <input type="date" className="form-control" value={form.birth_date} onChange={(e) => set('birth_date', e.target.value)} max={new Date().toISOString().slice(0, 10)} />
              {err('birth_date') || (age !== null && age >= 15 && <div className="form-text">{age} years old</div>)}
            </div>
            <div className="col-md-4">
              <label className="form-label">Civil status</label>
              <select className="form-select" value={form.civil_status} onChange={(e) => set('civil_status', e.target.value)}>
                {CIVIL_STATUSES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="col-md-4">
              <label className="form-label">Mobile number</label>
              <input type="tel" className="form-control" value={form.mobile} onChange={(e) => set('mobile', e.target.value)} placeholder="0917 123 4567" autoComplete="tel" />
              {err('mobile')}
            </div>

            <div className="col-md-6">
              <label className="form-label">Email</label>
              <input type="email" className="form-control" value={form.email} onChange={(e) => set('email', e.target.value)} autoComplete="email" />
              {err('email')}
            </div>
            <div className="col-md-6">
              <label className="form-label">Purok / Sitio</label>
              <select className="form-select" value={form.purok} onChange={(e) => set('purok', e.target.value)}>
                {PUROKS.map((p) => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div className="col-12">
              <label className="form-label">House no. / street</label>
              <input className="form-control" value={form.street_address} onChange={(e) => set('street_address', e.target.value)} placeholder="124 Mabini St." autoComplete="street-address" />
              {err('street_address')}
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="d-grid gap-3">
            <div style={{ maxWidth: 420 }}>
              <label className="form-label">ID type</label>
              <select className="form-select" value={form.id_type} onChange={(e) => set('id_type', e.target.value)}>
                {ID_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <IdOcrField
              file={idFile}
              onFile={setIdFile}
              idNumber={form.id_number}
              onIdNumber={(v) => set('id_number', v)}
              ocrText={ocrText}
              onOcrText={setOcrText}
              firstName={form.first_name}
              lastName={form.last_name}
            />
            {err('id_file')}
          </div>
        )}

        {step === 2 && (
          <div className="row g-4">
            <div className="col-md-6">
              <SelfieCapture value={selfie} onChange={setSelfie} />
              {err('selfie')}
            </div>
            <div className="col-md-6">
              <div className="fw-medium mb-2">Tips for a clear photo</div>
              <ul className="text-muted small ps-3 mb-0">
                <li>Face the camera in good light</li>
                <li>No cap, mask, or sunglasses</li>
                <li>Should match the photo on your ID</li>
              </ul>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="row g-3">
            <div className="col-md-6">
              <label className="form-label">Password</label>
              <input type="password" className="form-control" value={form.password} onChange={(e) => set('password', e.target.value)} autoComplete="new-password" />
              {err('password')}
            </div>
            <div className="col-md-6">
              <label className="form-label">Confirm password</label>
              <input type="password" className="form-control" value={form.confirm} onChange={(e) => set('confirm', e.target.value)} autoComplete="new-password" />
              {err('confirm')}
            </div>
            <div className="col-12">
              <div className="form-check form-switch">
                <input className="form-check-input" type="checkbox" id="hh" checked={form.is_household_head} onChange={(e) => set('is_household_head', e.target.checked)} />
                <label className="form-check-label" htmlFor="hh">I’m the head of my household</label>
              </div>
              <div className="form-text">Lets you add family members and request documents for them.</div>
            </div>
            <div className="col-12">
              <div className="form-check">
                <input className="form-check-input" type="checkbox" id="consent" checked={form.consent} onChange={(e) => set('consent', e.target.checked)} />
                <label className="form-check-label small text-muted" htmlFor="consent">
                  Pinatutunayan kong totoo ang lahat ng impormasyon at pumapayag ako na gamitin ito ng Barangay Talampas alinsunod sa Data Privacy Act of 2012 (RA 10173).
                </label>
              </div>
              {err('consent')}
            </div>
            {submitError && <div className="col-12"><div className="alert alert-danger mb-0">{submitError}</div></div>}
          </div>
        )}

        <div className="d-flex justify-content-between align-items-center mt-4 pt-3 border-top">
          {step === 0 ? (
            <Link to="/login" className="small text-muted">Already registered? Log in</Link>
          ) : (
            <button type="button" className="btn btn-line" onClick={() => setStep((s) => s - 1)} disabled={submitting}>
              <i className="bi bi-arrow-left"></i> Back
            </button>
          )}
          {step < 3 ? (
            <button type="button" className="btn btn-ink" onClick={next}>
              Continue <i className="bi bi-arrow-right"></i>
            </button>
          ) : (
            <button type="button" className="btn btn-ink" onClick={submit} disabled={submitting}>
              {submitting && <span className="spinner-border spinner-border-sm" aria-hidden="true"></span>}
              Create account
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
