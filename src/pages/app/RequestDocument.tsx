import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../auth/context'
import { usePageTitle } from '../../usePageTitle'
import { errMsg, fullName, peso } from '../../lib/format'
import type { DocumentType, HouseholdMember } from '../../lib/types'
import { PageLoader } from '../../components/ui'
import VerificationNotice from './VerificationNotice'

const PURPOSES = ['Employment', 'School enrollment', 'Bank account', 'Postal ID', 'NBI / Police clearance', 'Medical assistance', 'Scholarship', 'Business permit']

export default function RequestDocument() {
  usePageTitle('Request a document • OneSitio')
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()

  const [types, setTypes] = useState<DocumentType[] | null>(null)
  const [members, setMembers] = useState<HouseholdMember[]>([])
  const [type, setType] = useState(params.get('type') ?? '')
  const [beneficiary, setBeneficiary] = useState('self')
  const [purpose, setPurpose] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!profile) return
    let cancelled = false
    Promise.all([
      supabase.from('document_types').select('*').eq('active', true).order('sort_order'),
      supabase.from('household_members').select('*').eq('head_id', profile.id).order('created_at'),
    ]).then(([t, m]) => {
      if (cancelled) return
      setTypes((t.data as DocumentType[]) ?? [])
      setMembers((m.data as HouseholdMember[]) ?? [])
    })
    return () => {
      cancelled = true
    }
  }, [profile])

  if (!profile || types === null) return <PageLoader />

  const verified = profile.verification_status === 'verified'
  const selected = types.find((t) => t.code === type)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!selected) return setError('Choose a document.')
    if (!purpose.trim()) return setError('Tell us what the document is for.')
    setSubmitting(true)
    setError('')
    const { data, error: insErr } = await supabase
      .from('document_requests')
      .insert({
        requester_id: profile.id,
        household_member_id: beneficiary === 'self' ? null : beneficiary,
        beneficiary_name: '',
        document_type: selected.code,
        purpose: purpose.trim(),
      })
      .select('id')
      .single()
    setSubmitting(false)
    if (insErr) return setError(errMsg(insErr))
    navigate(`/app/requests/${data.id}`, { replace: true })
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Request a document</h1>
          <p className="page-sub">Pumili ng dokumento, sabihin kung para saan, at isumite.</p>
        </div>
      </div>

      <VerificationNotice profile={profile} />

      <form onSubmit={submit} className="row g-4">
        <div className="col-lg-8 d-grid gap-4">
          <div className="panel">
            <div className="panel-head"><h2>1. Document</h2></div>
            <div className="row g-2">
              {types.map((t) => (
                <div className="col-md-6" key={t.code}>
                  <button type="button" className={`choice-card h-100 ${type === t.code ? 'selected' : ''}`} onClick={() => setType(t.code)}>
                    <div className="d-flex justify-content-between gap-2">
                      <span className="fw-semibold">{t.name}</span>
                      <span className="small">{Number(t.fee) === 0 ? 'Free' : peso(t.fee)}</span>
                    </div>
                    <div className="small text-muted mt-1">{t.description}</div>
                    {t.processing_time && <div className="small text-muted mt-2"><i className="bi bi-clock me-1"></i>{t.processing_time}</div>}
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="panel">
            <div className="panel-head"><h2>2. Para kanino?</h2></div>
            <select className="form-select" value={beneficiary} onChange={(e) => setBeneficiary(e.target.value)}>
              <option value="self">Myself — {fullName(profile)}</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.full_name} ({m.relationship})</option>
              ))}
            </select>
            <div className="form-text">
              {profile.is_household_head
                ? <>Need someone else? <Link to="/app/household">Add a household member</Link>.</>
                : 'Only heads of household can request for family members.'}
            </div>
          </div>

          <div className="panel">
            <div className="panel-head"><h2>3. Purpose</h2></div>
            <input className="form-control" list="purposes" value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="e.g. Employment at Bustos Commercial Center" maxLength={200} />
            <datalist id="purposes">{PURPOSES.map((p) => <option key={p} value={p} />)}</datalist>
          </div>
        </div>

        <div className="col-lg-4">
          <div className="panel" style={{ position: 'sticky', top: 88 }}>
            <div className="panel-head"><h2>Summary</h2></div>
            <dl className="kv" style={{ gridTemplateColumns: '90px 1fr', fontSize: '0.9rem' }}>
              <dt>Document</dt><dd>{selected?.name ?? '—'}</dd>
              <dt>For</dt><dd>{beneficiary === 'self' ? fullName(profile) : members.find((m) => m.id === beneficiary)?.full_name}</dd>
              <dt>Fee</dt><dd>{selected ? (Number(selected.fee) === 0 ? 'Free' : peso(selected.fee)) : '—'}</dd>
            </dl>
            <p className="small text-muted mt-3 mb-3">
              {selected && Number(selected.fee) > 0 ? 'You’ll pay after the secretary approves your request.' : 'Free documents go straight to processing after approval.'}
            </p>
            {error && <div className="field-error mb-2">{error}</div>}
            <button className="btn btn-ink w-100" disabled={!verified || submitting || !selected}>
              {submitting && <span className="spinner-border spinner-border-sm" aria-hidden="true"></span>}
              Submit request
            </button>
            {!verified && <div className="form-text text-center">Available once your account is verified.</div>}
          </div>
        </div>
      </form>
    </>
  )
}
