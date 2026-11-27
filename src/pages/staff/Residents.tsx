import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../supabaseClient'
import { usePageTitle } from '../../usePageTitle'
import { ageFrom, errMsg, fmtDate, fmtDateTime, fullName } from '../../lib/format'
import { nameFoundInText } from '../../lib/ocr'
import { signedUrl } from '../../lib/storage'
import type { Profile, Verification } from '../../lib/types'
import { EmptyState, Modal, PageLoader, VerificationPill } from '../../components/ui'

const FILTERS: { key: Verification | 'all'; label: string }[] = [
  { key: 'pending', label: 'To review' },
  { key: 'verified', label: 'Verified' },
  { key: 'rejected', label: 'Returned' },
  { key: 'unverified', label: 'Not submitted' },
  { key: 'all', label: 'All' },
]

export default function Residents() {
  usePageTitle('Resident verification • OneSitio')
  const [rows, setRows] = useState<Profile[] | null>(null)
  const [filter, setFilter] = useState<Verification | 'all'>('pending')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<Profile | null>(null)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let cancelled = false
    supabase
      .from('profiles')
      .select('*')
      .eq('role', 'resident')
      .order('updated_at', { ascending: false })
      .then(({ data }) => {
        if (!cancelled) setRows((data as Profile[]) ?? [])
      })
    return () => {
      cancelled = true
    }
  }, [reload])

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase()
    return (rows ?? []).filter(
      (p) =>
        (filter === 'all' || p.verification_status === filter) &&
        (!term || `${fullName(p)} ${p.email} ${p.resident_code}`.toLowerCase().includes(term)),
    )
  }, [rows, filter, q])

  if (rows === null) return <PageLoader />

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Resident verification</h1>
          <p className="page-sub">Check each resident’s ID and selfie before they can request documents.</p>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head flex-wrap">
          <div className="seg">
            {FILTERS.map((f) => (
              <button key={f.key} type="button" className={filter === f.key ? 'active' : ''} onClick={() => setFilter(f.key)}>
                {f.label} {f.key !== 'all' && <span className="text-muted">({rows.filter((r) => r.verification_status === f.key).length})</span>}
              </button>
            ))}
          </div>
          <input className="form-control" style={{ maxWidth: 260 }} placeholder="Search name, email, ID" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>

        {shown.length === 0 ? (
          <EmptyState icon="bi-person-check" title="Nothing to show" text={filter === 'pending' ? 'No IDs waiting for review.' : undefined} />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Resident</th><th>Address</th><th>ID</th><th>Updated</th><th className="text-end">Status</th></tr></thead>
              <tbody>
                {shown.map((p) => (
                  <tr key={p.id} className="clickable" onClick={() => setOpen(p)}>
                    <td>
                      <div className="fw-medium">{fullName(p) || '—'}</div>
                      <div className="small text-muted">{p.email} · <span className="mono">{p.resident_code}</span></div>
                    </td>
                    <td className="small">{p.purok || '—'}</td>
                    <td className="small">{p.id_type || '—'}</td>
                    <td className="small text-muted">{fmtDate(p.updated_at)}</td>
                    <td className="text-end"><VerificationPill status={p.verification_status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {open && <ResidentModal key={open.id} resident={open} onClose={() => setOpen(null)} onDone={() => { setOpen(null); setReload((n) => n + 1) }} />}
    </>
  )
}

function ResidentModal({ resident, onClose, onDone }: { resident: Profile; onClose: () => void; onDone: () => void }) {
  const [idUrl, setIdUrl] = useState<string | null>(null)
  const [selfieUrl, setSelfieUrl] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    Promise.all([signedUrl(resident.id_image_path), signedUrl(resident.selfie_path)]).then(([a, b]) => {
      if (cancelled) return
      setIdUrl(a)
      setSelfieUrl(b)
    })
    return () => {
      cancelled = true
    }
  }, [resident.id_image_path, resident.selfie_path])

  const decide = async (status: 'verified' | 'rejected') => {
    if (status === 'rejected' && !note.trim()) return setError('Tell the resident why so they can fix it.')
    setSaving(true)
    const { error: e } = await supabase
      .from('profiles')
      .update({ verification_status: status, verification_note: note.trim() || null })
      .eq('id', resident.id)
    setSaving(false)
    if (e) return setError(errMsg(e))
    onDone()
  }

  const nameOnId = resident.ocr_text ? nameFoundInText(resident.ocr_text, resident.first_name, resident.last_name) : null
  const age = ageFrom(resident.birth_date)

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={fullName(resident) || resident.email || 'Resident'}
      footer={
        resident.verification_status === 'pending' ? (
          <>
            <button type="button" className="btn btn-danger-line" onClick={() => decide('rejected')} disabled={saving}>Return for resubmission</button>
            <button type="button" className="btn btn-ink" onClick={() => decide('verified')} disabled={saving}>
              <i className="bi bi-check-lg"></i> Verify resident
            </button>
          </>
        ) : undefined
      }
    >
      <div className="row g-4">
        <div className="col-md-6">
          <dl className="kv" style={{ gridTemplateColumns: '120px 1fr', fontSize: '0.9rem' }}>
            <dt>Status</dt><dd><VerificationPill status={resident.verification_status} /></dd>
            <dt>Resident ID</dt><dd className="mono">{resident.resident_code}</dd>
            <dt>Birth date</dt><dd>{fmtDate(resident.birth_date)}{age !== null && ` (${age})`}</dd>
            <dt>Civil status</dt><dd>{resident.civil_status || '—'}</dd>
            <dt>Address</dt><dd>{[resident.street_address, resident.purok].filter(Boolean).join(', ') || '—'}</dd>
            <dt>Mobile</dt><dd>{resident.mobile || '—'}</dd>
            <dt>Email</dt><dd>{resident.email}</dd>
            <dt>ID type</dt><dd>{resident.id_type || '—'}</dd>
            <dt>ID number</dt><dd className="mono">{resident.id_number || '—'}</dd>
            <dt>Household</dt><dd>{resident.is_household_head ? 'Head of household' : 'Member'}</dd>
            {resident.verified_at && (<><dt>Decided</dt><dd>{fmtDateTime(resident.verified_at)}</dd></>)}
            {resident.verification_note && (<><dt>Note</dt><dd>{resident.verification_note}</dd></>)}
          </dl>
          {resident.ocr_text && (
            <div className="mt-3">
              <div className="form-label d-flex justify-content-between">
                OCR text from ID
                {nameOnId !== null && (
                  <span className="small" style={{ color: nameOnId ? 'var(--ok)' : 'var(--warn)' }}>
                    {nameOnId ? 'Name found on ID' : 'Name not found — check manually'}
                  </span>
                )}
              </div>
              <div className="ocr-box">{resident.ocr_text}</div>
            </div>
          )}
        </div>
        <div className="col-md-6 d-grid gap-3 align-content-start">
          <div>
            <div className="form-label">Valid ID</div>
            <div className="media-frame">{idUrl ? <a href={idUrl} target="_blank" rel="noreferrer"><img src={idUrl} alt="Resident ID" /></a> : <span className="small text-muted">No file</span>}</div>
          </div>
          <div>
            <div className="form-label">Selfie</div>
            <div className="media-frame">{selfieUrl ? <img src={selfieUrl} alt="Resident selfie" /> : <span className="small text-muted">No file</span>}</div>
          </div>
          {resident.verification_status === 'pending' && (
            <div>
              <label className="form-label">Note to resident <span className="text-muted">(required when returning)</span></label>
              <textarea className="form-control" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. ID photo is blurry, please retake" />
              {error && <div className="field-error">{error}</div>}
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
