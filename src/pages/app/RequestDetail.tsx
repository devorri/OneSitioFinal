import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import { usePageTitle } from '../../usePageTitle'
import { errMsg, fmtDateTime, methodLabel, peso, requestStatusMeta } from '../../lib/format'
import type { DocumentRequest, Payment, RequestEvent } from '../../lib/types'
import { EmptyState, PageLoader, PaymentPill, RequestStatusPill } from '../../components/ui'
import RequestStepper from '../../components/RequestStepper'
import PayModal from '../../components/PayModal'

export default function RequestDetail() {
  const { id } = useParams()
  const [req, setReq] = useState<DocumentRequest | null | undefined>(undefined)
  const [events, setEvents] = useState<RequestEvent[]>([])
  const [payment, setPayment] = useState<Payment | null>(null)
  const [paying, setPaying] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [error, setError] = useState('')
  usePageTitle(req ? `${req.reference_code} • OneSitio` : 'Request • OneSitio')

  const load = useCallback(async () => {
    if (!id) return
    const [r, e, p] = await Promise.all([
      supabase.from('document_requests').select('*, document_types(name)').eq('id', id).maybeSingle(),
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

  if (req === undefined) return <PageLoader />
  if (req === null) {
    return <EmptyState icon="bi-search" title="Request not found" action={<Link to="/app/requests" className="btn btn-line btn-sm">Back to my requests</Link>} />
  }

  const cancel = async () => {
    if (!window.confirm('Cancel this request?')) return
    setCancelling(true)
    const { error: rpcErr } = await supabase.rpc('cancel_request', { p_request_id: req.id })
    setCancelling(false)
    if (rpcErr) return setError(errMsg(rpcErr))
    load()
  }

  const needsPayment = req.status === 'approved' && req.payment_status === 'unpaid' && Number(req.fee) > 0

  return (
    <>
      <Link to="/app/requests" className="small text-muted d-inline-flex align-items-center gap-1 mb-3">
        <i className="bi bi-arrow-left"></i> My requests
      </Link>

      <div className="page-head">
        <div>
          <span className="eyebrow mono">{req.reference_code}</span>
          <h1 className="mt-1">{req.document_types?.name}</h1>
          <p className="page-sub">For {req.beneficiary_name} · {req.purpose}</p>
        </div>
        <div className="d-flex gap-2">
          <RequestStatusPill status={req.status} />
          <PaymentPill status={req.payment_status} fee={Number(req.fee)} />
        </div>
      </div>

      {needsPayment && (
        <div className="note note-warn mb-4">
          <i className="bi bi-wallet2"></i>
          <span className="flex-grow-1">Approved! Pay {peso(req.fee)} to continue — then the barangay prepares your document.</span>
          <button type="button" className="btn btn-ink btn-sm" onClick={() => setPaying(true)}>Pay now</button>
        </div>
      )}
      {req.status === 'ready' && (
        <div className="note note-ok mb-4">
          <i className="bi bi-check-circle"></i>
          <span>Ready for pickup at the Barangay Hall (Mon–Fri, 8 AM–5 PM). Bring a valid ID and your reference code <strong className="mono">{req.reference_code}</strong>.</span>
        </div>
      )}
      {(req.status === 'rejected' || req.status === 'cancelled') && (
        <div className="note note-bad mb-4">
          <i className="bi bi-x-circle"></i>
          <span>{requestStatusMeta[req.status].label}{req.staff_note ? ` — ${req.staff_note}` : ''}</span>
        </div>
      )}
      {error && <div className="alert alert-danger">{error}</div>}

      <div className="row g-3">
        <div className="col-lg-8 d-grid gap-3">
          {!['rejected', 'cancelled'].includes(req.status) && (
            <div className="panel">
              <div className="panel-head"><h2>Progress</h2></div>
              <RequestStepper status={req.status} paymentStatus={req.payment_status} />
            </div>
          )}

          <div className="panel">
            <div className="panel-head"><h2>History</h2></div>
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

        <div className="col-lg-4 d-grid gap-3 align-content-start">
          <div className="panel">
            <div className="panel-head"><h2>Details</h2></div>
            <dl className="kv" style={{ gridTemplateColumns: '90px 1fr', fontSize: '0.9rem' }}>
              <dt>Reference</dt><dd className="mono">{req.reference_code}</dd>
              <dt>Filed</dt><dd>{fmtDateTime(req.created_at)}</dd>
              <dt>Fee</dt><dd>{Number(req.fee) === 0 ? 'Free' : peso(req.fee)}</dd>
              {req.released_at && (<><dt>Released</dt><dd>{fmtDateTime(req.released_at)}</dd></>)}
            </dl>
            {req.status === 'pending' && (
              <button type="button" className="btn btn-danger-line btn-sm mt-3" onClick={cancel} disabled={cancelling}>
                Cancel request
              </button>
            )}
          </div>

          {payment && (
            <div className="panel">
              <div className="panel-head"><h2>Payment</h2></div>
              <dl className="kv" style={{ gridTemplateColumns: '90px 1fr', fontSize: '0.9rem' }}>
                <dt>Amount</dt><dd>{peso(payment.amount)}</dd>
                <dt>Method</dt><dd>{methodLabel[payment.method]}</dd>
                <dt>Reference</dt><dd className="mono small">{payment.reference_no}</dd>
                <dt>Paid</dt><dd>{fmtDateTime(payment.created_at)}</dd>
              </dl>
            </div>
          )}
        </div>
      </div>

      <PayModal request={paying ? req : null} onClose={() => setPaying(false)} onPaid={load} />
    </>
  )
}
