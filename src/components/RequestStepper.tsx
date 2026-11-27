import type { PaymentStatus, RequestStatus } from '../lib/types'

const STEPS = ['Submitted', 'Under review', 'Approved', 'Ready for pickup', 'Released']
const INDEX: Partial<Record<RequestStatus, number>> = { pending: 0, under_review: 1, approved: 2, ready: 3, released: 4 }

export default function RequestStepper({ status, paymentStatus }: { status: RequestStatus; paymentStatus: PaymentStatus }) {
  const current = INDEX[status]
  if (current === undefined) return null
  return (
    <div className="stepper" aria-label="Request progress">
      {STEPS.map((label, i) => {
        const state = i < current || status === 'released' ? 'done' : i === current ? 'current' : ''
        const text = i === 2 && status === 'approved' && paymentStatus === 'unpaid' ? 'Approved · awaiting payment' : label
        return (
          <div className={`stepper-item ${state}`} key={label}>
            <div className="stepper-bar"></div>
            <div className="stepper-label">{text}</div>
          </div>
        )
      })}
    </div>
  )
}
