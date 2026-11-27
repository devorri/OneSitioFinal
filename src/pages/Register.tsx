import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { usePageTitle } from '../usePageTitle'
import { useAuth } from '../auth/context'
import { CIVIL_STATUSES, ID_TYPES, PUROKS, ageFrom, errMsg } from '../lib/format'
import { addressToForm } from '../lib/idParser'
import type { OcrResult } from '../lib/ocr'
import { extOf, uploadResidentFile } from '../lib/storage'
import IdScanner from '../components/IdScanner'
import SelfieCapture from '../components/SelfieCapture'
import SocialButtons from '../components/SocialButtons'

const STEPS = ['Valid ID', 'Personal details', 'Selfie', 'Account']

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

type TextKey = Exclude<keyof Form, 'is_household_head' | 'consent'>

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
  const [fromId, setFromId] = useState<Set<TextKey>>(new Set())
  const [autoVals, setAutoVals] = useState<Partial<Record<TextKey, string>>>({})
  const [idAddress, setIdAddress] = useState<{ text: string; inTalampas: boolean } | null>(null)
  const [selfie, setSelfie] = useState<Blob | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [done, setDone] = useState<Done>(null)

  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setForm((f) => ({ ...f, [k]: v }))
    if (fromId.has(k as TextKey)) {
      setFromId((s) => {
        const n = new Set(s)
        n.delete(k as TextKey)
        return n
      })
    }
  }
  const age = ageFrom(form.birth_date)

  /** Fill the form from the ID. Never overwrites something the user typed themselves. */
  const applyScan = (r: OcrResult) => {
    const p = r.parsed
    const addr = addressToForm(p.address, PUROKS)
    const incoming: Partial<Record<TextKey, string>> = {
      first_name: p.firstName,
      middle_name: p.middleName,
      last_name: p.lastName,
      suffix: p.suffix,
      birth_date: p.birthDate,
      id_number: p.idNumber,
      street_address: addr.street,
      purok: addr.purok,
    }
    const willFill = (Object.keys(incoming) as TextKey[]).filter((k) => {
      const cur = form[k]
      return !!incoming[k] && (!cur || cur === autoVals[k] || (k === 'purok' && cur === PUROKS[0]))
    })
    setForm((f) => {
      const next = { ...f }
      for (const [k, v] of Object.entries(incoming) as [TextKey, string][]) {
        if (!v) continue
        const cur = f[k]
        const untouched = !cur || cur === autoVals[k] || (k === 'purok' && cur === PUROKS[0])
        if (untouched) next[k] = v
      }
      return next
    })
    setAutoVals(incoming)
    setFromId(new Set(willFill))
    setOcrText(r.text.slice(0, 4000))
    setIdAddress(p.address ? { text: p.address, inTalampas: addr.inTalampas } : null)
  }

  const validate = (s: number) => {
    const e: typeof errors = {}
    if (s === 0 && !idFile) e.id_file = 'Please upload a photo of your ID'
    if (s === 1) {
      if (!form.first_name.trim()) e.first_name = 'Required'
      if (!form.last_name.trim()) e.last_name = 'Required'
      if (!form.birth_date) e.birth_date = 'Required'
      else if (age !== null && age < 15) e.birth_date = 'You must be at least 15 years old'
      if (!/^(\+63|0)9\d{2}[\s-]?\d{3}[\s-]?\d{4}$/.test(form.mobile.trim())) e.mobile = 'Use a PH mobile number, e.g. 0917 123 4567'
      if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) e.email = 'Enter a valid email'
      if (!form.street_address.trim()) e.street_address = 'Required'
    }
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
            ocr_text: ocrText,
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
  const tag = (k: TextKey) => fromId.has(k) && <span className="from-id">from ID</span>

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
    <div className="container py-5" style={{ maxWidth: 860 }}>
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
              <div className="small text-muted">Kakailanganin mo pa ring mag-upload ng ID pagkatapos.</div>
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
          <div className="d-grid gap-3">
            <div>
              <h2 className="h5 mb-1">I-upload ang iyong valid ID</h2>
              <p className="text-muted small mb-0">Babasahin namin ang ID para awtomatikong mapunan ang pangalan, kaarawan, at address mo.</p>
            </div>
            <div className="row g-3">
              <div className="col-md-6">
                <label className="form-label">ID type</label>
                <select className="form-select" value={form.id_type} onChange={(e) => set('id_type', e.target.value)}>
                  {ID_TYPES.map((t) => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div className="col-md-6">
                <label className="form-label">ID number {tag('id_number')}</label>
                <input className="form-control mono" value={form.id_number} onChange={(e) => set('id_number', e.target.value)} placeholder="Filled in after reading your ID" />
              </div>
            </div>
            <IdScanner file={idFile} onFile={setIdFile} onScanned={applyScan} />
            {err('id_file')}
          </div>
        )}

        {step === 1 && (
          <div className="row g-3">
            {fromId.size > 0 && (
              <div className="col-12">
                <div className="note py-2">
                  <i className="bi bi-magic"></i>
                  <span>Fields marked <span className="from-id ms-0">from ID</span> were read from your ID. Please check them — OCR can make mistakes.</span>
                </div>
              </div>
            )}
            <div className="col-md-4">
              <label className="form-label">First name {tag('first_name')}</label>
              <input className="form-control" value={form.first_name} onChange={(e) => set('first_name', e.target.value)} autoComplete="given-name" />
              {err('first_name')}
            </div>
            <div className="col-md-3">
              <label className="form-label">Middle name {tag('middle_name')}</label>
              <input className="form-control" value={form.middle_name} onChange={(e) => set('middle_name', e.target.value)} autoComplete="additional-name" />
            </div>
            <div className="col-md-3">
              <label className="form-label">Last name {tag('last_name')}</label>
              <input className="form-control" value={form.last_name} onChange={(e) => set('last_name', e.target.value)} autoComplete="family-name" />
              {err('last_name')}
            </div>
            <div className="col-md-2">
              <label className="form-label">Suffix {tag('suffix')}</label>
              <input className="form-control" value={form.suffix} onChange={(e) => set('suffix', e.target.value)} placeholder="Jr." />
            </div>

            <div className="col-md-4">
              <label className="form-label">Birth date {tag('birth_date')}</label>
              <input type="date" className="form-control" value={form.birth_date} onChange={(e) => set('birth_date', e.target.value)} max={new Date().toISOString().slice(0, 10)} />
              {err('birth_date') ||
                (age !== null && (
                  <div className="age-chip" style={{ color: age >= 15 ? 'var(--ok)' : 'var(--bad)' }}>
                    <i className={`bi ${age >= 15 ? 'bi-check-circle' : 'bi-x-circle'}`}></i>
                    {age} years old {age >= 15 ? '· eligible' : '· must be 15+'}
                  </div>
                ))}
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
              <label className="form-label">Purok / Sitio {tag('purok')}</label>
              <select className="form-select" value={form.purok} onChange={(e) => set('purok', e.target.value)}>
                {PUROKS.map((p) => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div className="col-12">
              <label className="form-label">House no. / street {tag('street_address')}</label>
              <input className="form-control" value={form.street_address} onChange={(e) => set('street_address', e.target.value)} placeholder="124 Mabini St." autoComplete="street-address" />
              {err('street_address')}
              {idAddress && (
                <div className="form-text">Address on ID: {idAddress.text}</div>
              )}
            </div>
            {idAddress && !idAddress.inTalampas && (
              <div className="col-12">
                <div className="note note-warn py-2">
                  <i className="bi bi-geo-alt"></i>
                  <span>The address on your ID isn’t in Barangay Talampas. You can still register — the secretary may ask for proof that you live here now.</span>
                </div>
              </div>
            )}
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
