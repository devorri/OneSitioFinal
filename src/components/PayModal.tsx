import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { errMsg, methodLabel, peso } from '../lib/format'
import type { DocumentRequest, PaymentMethod } from '../lib/types'
import { Modal } from './ui'

const METHODS: { id: Exclude<PaymentMethod, 'cash'>; icon: string; hint: string }[] = [
  { id: 'gcash', icon: 'bi-phone', hint: 'Pay with your GCash wallet' },
  { id: 'maya', icon: 'bi-wallet2', hint: 'Pay with your Maya wallet' },
  { id: 'qrph', icon: 'bi-qr-code', hint: 'Scan with any bank app' },
  { id: 'card', icon: 'bi-credit-card', hint: 'Visa / Mastercard' },
]

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

export default function PayModal({
  request,
  onClose,
  onPaid,
}: {
  request: DocumentRequest | null
  onClose: () => void
  onPaid: () => void
}) {
  const [method, setMethod] = useState<Exclude<PaymentMethod, 'cash'>>('gcash')
  const [step, setStep] = useState<'choose' | 'processing' | 'done'>('choose')
  const [refNo, setRefNo] = useState('')
  const [error, setError] = useState('')

  const close = () => {
    if (step === 'processing') return
    if (step === 'done') onPaid()
    setStep('choose')
    setError('')
    onClose()
  }

  const pay = async () => {
    if (!request) return
    setError('')
    setStep('processing')
    await delay(1200)
    const { data, error: rpcError } = await supabase.rpc('pay_request', { p_request_id: request.id, p_method: method })
    if (rpcError) {
      setError(errMsg(rpcError))
      setStep('choose')
      return
    }
    setRefNo(String(data))
    setStep('done')
  }

  return (
    <Modal
      open={!!request}
      onClose={close}
      title={step === 'done' ? 'Payment received' : 'Pay document fee'}
      footer={
        step === 'choose' ? (
          <>
            <button type="button" className="btn btn-line" onClick={close}>Cancel</button>
            <button type="button" className="btn btn-ink" onClick={pay}>
              Pay {request ? peso(request.fee) : ''}
            </button>
          </>
        ) : step === 'done' ? (
          <button type="button" className="btn btn-ink" onClick={close}>Done</button>
        ) : undefined
      }
    >
      {request && step === 'choose' && (
        <>
          <div className="d-flex justify-content-between align-items-baseline mb-3">
            <div>
              <div className="fw-semibold">{request.document_types?.name}</div>
              <div className="text-muted small mono">{request.reference_code}</div>
            </div>
            <div className="stat-value" style={{ fontSize: '1.4rem' }}>{peso(request.fee)}</div>
          </div>

          <div className="d-grid gap-2 mb-3">
            {METHODS.map((m) => (
              <button
                type="button"
                key={m.id}
                className={`choice-card d-flex align-items-center gap-3 ${method === m.id ? 'selected' : ''}`}
                onClick={() => setMethod(m.id)}
              >
                <i className={`bi ${m.icon} fs-5`}></i>
                <span className="flex-grow-1">
                  <span className="d-block fw-medium">{methodLabel[m.id]}</span>
                  <span className="d-block small text-muted">{m.hint}</span>
                </span>
                {method === m.id && <i className="bi bi-check-circle-fill"></i>}
              </button>
            ))}
          </div>

          {error && <div className="alert alert-danger mb-3">{error}</div>}

          <div className="note">
            <i className="bi bi-info-circle"></i>
            <span>Simulated checkout for this student project — no real money is charged.</span>
          </div>
        </>
      )}

      {step === 'processing' && (
        <div className="text-center py-4">
          <span className="spinner-border mb-3" role="status" aria-hidden="true"></span>
          <div className="fw-medium">Processing {methodLabel[method]} payment…</div>
          <div className="text-muted small">Please don’t close this window.</div>
        </div>
      )}

      {step === 'done' && (
        <div className="text-center py-3">
          <i className="bi bi-check-circle" style={{ fontSize: '2.4rem', color: 'var(--ok)' }}></i>
          <h4 className="mt-2 mb-1">{request ? peso(request.fee) : ''} paid</h4>
          <p className="text-muted mb-2">Reference number</p>
          <div className="mono fs-6">{refNo}</div>
          <p className="text-muted small mt-3 mb-0">
            This payment was recorded on the public transparency ledger. We’ll let you know when your document is ready for pickup.
          </p>
        </div>
      )}
    </Modal>
  )
}
