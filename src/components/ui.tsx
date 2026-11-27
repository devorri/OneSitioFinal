import { useEffect, type ReactNode } from 'react'
import { requestStatusMeta, verificationMeta } from '../lib/format'
import type { PaymentStatus, RequestStatus, Verification } from '../lib/types'

export function PageLoader({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="page-loader">
      <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
      {label}
    </div>
  )
}

export function Pill({ tone, children }: { tone: string; children: ReactNode }) {
  return <span className={`st st-${tone}`}>{children}</span>
}

export function RequestStatusPill({ status }: { status: RequestStatus }) {
  const m = requestStatusMeta[status]
  return <Pill tone={m.tone}>{m.label}</Pill>
}

export function PaymentPill({ status, fee }: { status: PaymentStatus; fee?: number }) {
  if (status === 'waived' || fee === 0) return <Pill tone="gray">Free</Pill>
  if (status === 'paid') return <Pill tone="green">Paid</Pill>
  return <Pill tone="amber">Unpaid</Pill>
}

export function VerificationPill({ status }: { status: Verification }) {
  const m = verificationMeta[status]
  return <Pill tone={m.tone}>{m.label}</Pill>
}

export function EmptyState({ icon = 'bi-inbox', title, text, action }: { icon?: string; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <i className={`bi ${icon}`}></i>
      <h3>{title}</h3>
      {text && <p className="mb-3">{text}</p>}
      {action}
    </div>
  )
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="os-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`os-modal ${wide ? 'os-modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="os-modal-head">
          <h3>{title}</h3>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <i className="bi bi-x-lg"></i>
          </button>
        </div>
        <div className="os-modal-body">{children}</div>
        {footer && <div className="os-modal-foot">{footer}</div>}
      </div>
    </div>
  )
}

/** Philippine flag sun */
export function PhSun({ className, size = 20 }: { className?: string; size?: number }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className} aria-hidden="true">
      {Array.from({ length: 8 }, (_, i) => (
        <path key={i} d="M50 4 L55 26 L50 32 L45 26 Z" transform={`rotate(${i * 45} 50 50)`} fill="currentColor" />
      ))}
      <circle cx="50" cy="50" r="17" fill="currentColor" />
    </svg>
  )
}
