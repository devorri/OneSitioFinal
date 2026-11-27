import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import { usePageTitle } from '../../usePageTitle'
import { errMsg, fmtDate, fmtDateTime, methodLabel, peso, requestStatusMeta } from '../../lib/format'
import type { DocumentRequest, Payment, RequestEvent, RequestStatus } from '../../lib/types'
import { EmptyState, Modal, PageLoader, PaymentPill, RequestStatusPill } from '../../components/ui'
import RequestStepper from '../../components/RequestStepper'

const FILTERS = {
  open: { label: 'To process', match: (r: DocumentRequest) => ['pending', 'under_review'].includes(r.status) },
  approved: { label: 'Approved', match: (r: DocumentRequest) => r.status === 'approved' },
  ready: { label: 'Ready', match: (r: DocumentRequest) => r.status === 'ready' },
  closed: { label: 'Closed', match: (r: DocumentRequest) => ['released', 'rejected', 'cancelled'].includes(r.status) },
  all: { label: 'All', match: () => true },
} as const
type FilterKey = keyof typeof FILTERS

const SELECT = '*, document_types(name), profiles(first_name,last_name,resident_code,email,mobile,purok)'

export default function Requests() {
  usePageTitle('Document requests • OneSitio')
  const [params, setParams] = useSearchParams()
  const [rows, setRows] = useState<DocumentRequest[] | null>(null)
  const [q, setQ] = useState('')
  const [reload, setReload] = useState(0)

  const filterParam = params.get('filter')
  const filter: FilterKey = filterParam && filterParam in FILTERS ? (filterParam as FilterKey) : 'open'
  const openId = params.get('open')

  useEffect(() => {
    let cancelled = false
    supabase
      .from('document_requests')
      .select(SELECT)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (!cancelled) setRows((data as DocumentRequest[]) ?? [])
      })
    return () => {
      cancelled = true
    }
  }, [reload])

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase()
    return (rows ?? []).filter(
      (r) =>
        FILTERS[filter].match(r) &&
        (!term ||
          `${r.reference_code} ${r.beneficiary_name} ${r.profiles?.first_name} ${r.profiles?.last_name} ${r.document_types?.name}`
            .toLowerCase()
            .includes(term)),
    )
  }, [rows, filter, q])

  const setParam = (k: string, v: string | null) => {
    const next = new URLSearchParams(params)
    if (v === null) next.delete(k)
    else next.set(k, v)
    setParams(next, { replace: true })
  }

  if (rows === null) return <PageLoader />

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Document requests</h1>
          <p className="page-sub">Review, approve, record payments, and release documents.</p>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head flex-wrap">
          <div className="seg">
            {(Object.keys(FILTERS) as FilterKey[]).map((k) => (
              <button key={k} type="button" className={filter === k ? 'active' : ''} onClick={() => setParam('filter', k)}>
                {FILTERS[k].label} {k !== 'all' && <span className="text-muted">({rows.filter(FILTERS[k].match).length})</span>}
              </button>
            ))}
          </div>
          <input className="form-control" style={{ maxWidth: 260 }} placeholder="Search reference or name" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>

        {shown.length === 0 ? (
          <EmptyState icon="bi-inboxes" title="Nothing here" text="No requests match this filter." />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Reference</th><th>Document</th><th>Resident / for</th><th>Filed</th><th>Payment</th><th className="text-end">Status</th></tr></thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id} className="clickable" onClick={() => setParam('open', r.id)}>
                    <td className="mono">{r.reference_code}</td>
                    <td className="fw-medium">{r.document_types?.name}</td>
                    <td className="small">
                      {r.profiles ? `${r.profiles.first_name} ${r.profiles.last_name}` : '—'}
                      {r.household_member_id && <div className="text-muted">for {r.beneficiary_name}</div>}
                    </td>
                    <td className="small text-muted">{fmtDate(r.created_at)}</td>
                    <td className="small">{Number(r.fee) === 0 ? 'Free' : peso(r.fee)} <PaymentPill status={r.payment_status} fee={Number(r.fee)} /></td>
                    <td className="text-end"><RequestStatusPill status={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {openId && (
        <RequestModal
          key={openId}
          id={openId}
          onClose={() => setParam('open', null)}
          onChanged={() => setReload((n) => n + 1)}
        />
      )}
    </>
  )
}

function RequestModal({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const [req, setReq] = useState<DocumentRequest | null | undefined>(undefined)
  const [events, setEvents] = useState<RequestEvent[]>([])
  const [payment, setPayment] = useState<Payment | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const [r, e, p] = await Promise.all([
      supabase.from('document_requests').select(SELECT).eq('id', id).maybeSingle(),
      supabase.from('request_events').select('*').eq('request_id', id).order('created_at', { ascending: false }),
      supabase.from('payments').select('*').eq('request_id', id).maybeSingle(),
    ])
    setReq((r.data as DocumentRequest) ?? null)
    setEvents((e.data as RequestEvent[]) ?? [])
    setPayment((p.data as Payment) ?? null)
  }, [id])

  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(() => {
      if (!cancelled) load()
    })
    return () => {
      cancelled = true
    }
  }, [load])

  const move = async (status: RequestStatus) => {
    if (status === 'rejected' && !note.trim()) return setError('Add a reason so the resident knows what to fix.')
    setBusy(true)
    setError('')
    const { error: e } = await supabase.from('document_requests').update({ status, staff_note: note.trim() || null }).eq('id', id)
    setBusy(false)
    if (e) return setError(errMsg(e))
    setNote('')
    await load()
    onChanged()
  }

  const cash = async () => {
    if (!window.confirm('Record a cash payment received at the Barangay Hall?')) return
    setBusy(true)
    setError('')
    const { error: e } = await supabase.rpc('record_cash_payment', { p_request_id: id })
    setBusy(false)
    if (e) return setError(errMsg(e))
    await load()
    onChanged()
  }

  const paid = req && (req.payment_status === 'paid' || req.payment_status === 'waived')

  const actions = req ? (
    <>
      {['pending', 'under_review', 'approved'].includes(req.status) && (
        <button type="button" className="btn btn-danger-line" onClick={() => move('rejected')} disabled={busy}>Reject</button>
      )}
      {req.status === 'pending' && <button type="button" className="btn btn-ink" onClick={() => move('under_review')} disabled={busy}>Start review</button>}
      {req.status === 'under_review' && <button type="button" className="btn btn-ink" onClick={() => move('approved')} disabled={busy}>Approve</button>}
      {req.status === 'approved' && !paid && <button type="button" className="btn btn-line" onClick={cash} disabled={busy}>Record cash payment</button>}
      {req.status === 'approved' && <button type="button" className="btn btn-ink" onClick={() => move('ready')} disabled={busy || !paid} title={paid ? '' : 'Waiting for payment'}>Mark ready for pickup</button>}
      {req.status === 'ready' && <button type="button" className="btn btn-ink" onClick={() => move('released')} disabled={busy}>Mark released</button>}
    </>
  ) : undefined

  const closed = req && ['released', 'rejected', 'cancelled'].includes(req.status)

  return (
    <Modal open wide onClose={onClose} title={req ? `${req.reference_code} · ${req.document_types?.name ?? ''}` : 'Request'} footer={closed ? undefined : actions}>
      {req === undefined && <PageLoader />}
      {req === null && <EmptyState title="Request not found" />}
      {req && (
        <div className="row g-4">
          <div className="col-md-6 d-grid gap-3 align-content-start">
            <div className="d-flex gap-2">
              <RequestStatusPill status={req.status} />
              <PaymentPill status={req.payment_status} fee={Number(req.fee)} />
            </div>
            {!['rejected', 'cancelled'].includes(req.status) && <RequestStepper status={req.status} paymentStatus={req.payment_status} />}
            <dl className="kv" style={{ gridTemplateColumns: '110px 1fr', fontSize: '0.9rem' }}>
              <dt>Resident</dt><dd>{req.profiles ? `${req.profiles.first_name} ${req.profiles.last_name}` : '—'} <span className="mono small text-muted">{req.profiles?.resident_code}</span></dd>
              <dt>For</dt><dd>{req.beneficiary_name}{req.household_member_id && <span className="text-muted"> (household member)</span>}</dd>
              <dt>Purpose</dt><dd>{req.purpose}</dd>
              <dt>Contact</dt><dd>{req.profiles?.mobile || '—'} · {req.profiles?.email}</dd>
              <dt>Purok</dt><dd>{req.profiles?.purok || '—'}</dd>
              <dt>Fee</dt><dd>{Number(req.fee) === 0 ? 'Free' : peso(req.fee)}</dd>
              {payment && (<><dt>Paid via</dt><dd>{methodLabel[payment.method]} · <span className="mono small">{payment.reference_no}</span></dd></>)}
              <dt>Filed</dt><dd>{fmtDateTime(req.created_at)}</dd>
            </dl>
            {!closed && (
              <div>
                <label className="form-label">Note <span className="text-muted">(shown to the resident; required when rejecting)</span></label>
                <textarea className="form-control" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
            )}
            {req.status === 'approved' && !paid && (
              <div className="note note-warn py-2"><i className="bi bi-wallet2"></i><span>Waiting for the resident to pay online, or record a cash payment.</span></div>
            )}
            {error && <div className="alert alert-danger mb-0">{error}</div>}
          </div>
          <div className="col-md-6">
            <div className="form-label">History</div>
            <ul className="timeline">
              {events.map((ev) => (
                <li key={ev.id}>
                  <div className="t-title">{requestStatusMeta[ev.status].label}{ev.note ? ` — ${ev.note}` : ''}</div>
                  <div className="t-meta">{fmtDateTime(ev.created_at)}</div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </Modal>
  )
}
