import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../auth/context'
import { usePageTitle } from '../../usePageTitle'
import { fmtDate, fullName, peso } from '../../lib/format'
import type { DocumentRequest } from '../../lib/types'
import { EmptyState, PageLoader, PaymentPill, RequestStatusPill, VerificationPill } from '../../components/ui'
import VerificationNotice from './VerificationNotice'
import Avatar from '../../components/Avatar'

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Magandang umaga' : h < 18 ? 'Magandang hapon' : 'Magandang gabi'
}

export default function Dashboard() {
  usePageTitle('Overview • OneSitio')
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [requests, setRequests] = useState<DocumentRequest[] | null>(null)

  useEffect(() => {
    if (!profile) return
    let cancelled = false
    supabase
      .from('document_requests')
      .select('*, document_types(name)')
      .eq('requester_id', profile.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (!cancelled) setRequests((data as DocumentRequest[]) ?? [])
      })
    return () => {
      cancelled = true
    }
  }, [profile])

  if (!profile || requests === null) return <PageLoader />

  const active = requests.filter((r) => ['pending', 'under_review', 'approved'].includes(r.status)).length
  const toPay = requests.filter((r) => r.status === 'approved' && r.payment_status === 'unpaid').length
  const ready = requests.filter((r) => r.status === 'ready').length

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{greeting()}, {profile.first_name}!</h1>
          <p className="page-sub">Narito ang lahat ng request mo sa Barangay Talampas.</p>
        </div>
        <Link to="/app/request" className="btn btn-ink"><i className="bi bi-plus-lg"></i> Request a document</Link>
      </div>

      <VerificationNotice profile={profile} />

      <div className="row g-3 mb-4">
        <div className="col-md-4">
          <div className="panel stat">
            <span className="stat-label">In progress</span>
            <span className="stat-value">{active}</span>
            <span className="stat-sub">Submitted, in review, or approved</span>
          </div>
        </div>
        <div className="col-md-4">
          <div className="panel stat">
            <span className="stat-label">Waiting for payment</span>
            <span className="stat-value">{toPay}</span>
            <span className="stat-sub">{toPay ? 'Pay online to continue' : 'Nothing to pay'}</span>
          </div>
        </div>
        <div className="col-md-4">
          <div className="panel stat">
            <span className="stat-label">Ready for pickup</span>
            <span className="stat-value">{ready}</span>
            <span className="stat-sub">Claim at the Barangay Hall</span>
          </div>
        </div>
      </div>

      <div className="row g-3">
        <div className="col-lg-8">
          <div className="panel h-100">
            <div className="panel-head">
              <h2>Recent requests</h2>
              <Link to="/app/requests" className="small">View all</Link>
            </div>
            {requests.length === 0 ? (
              <EmptyState
                icon="bi-file-earmark"
                title="No requests yet"
                text="Your document requests will show up here."
                action={<Link to="/app/request" className="btn btn-line btn-sm">Request a document</Link>}
              />
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr><th>Document</th><th>Filed</th><th>Fee</th><th className="text-end">Status</th></tr>
                  </thead>
                  <tbody>
                    {requests.slice(0, 6).map((r) => (
                      <tr key={r.id} className="clickable" onClick={() => navigate(`/app/requests/${r.id}`)}>
                        <td>
                          <div className="fw-medium">{r.document_types?.name}</div>
                          <div className="small text-muted"><span className="mono">{r.reference_code}</span> · {r.beneficiary_name}</div>
                        </td>
                        <td className="small text-muted">{fmtDate(r.created_at)}</td>
                        <td className="small">
                          {Number(r.fee) === 0 ? 'Free' : peso(r.fee)} <span className="ms-1"><PaymentPill status={r.payment_status} fee={Number(r.fee)} /></span>
                        </td>
                        <td className="text-end"><RequestStatusPill status={r.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="col-lg-4">
          <div className="panel h-100">
            <div className="panel-head">
              <h2>My details</h2>
              <Link to="/app/profile" className="small">Edit</Link>
            </div>
            <div className="d-flex align-items-center gap-3 mb-3">
              <Avatar url={profile.avatar_url} name={fullName(profile)} size={56} />
              <div>
                <div className="fw-semibold">{fullName(profile)}</div>
                <div className="small text-muted">
                  {[profile.street_address, profile.purok].filter(Boolean).join(', ')}
                  <br />Barangay Talampas, Bustos, Bulacan
                </div>
              </div>
            </div>
            <dl className="kv" style={{ gridTemplateColumns: '110px 1fr', fontSize: '0.88rem' }}>
              <dt>Resident ID</dt><dd className="mono">{profile.resident_code}</dd>
              <dt>Status</dt><dd><VerificationPill status={profile.verification_status} /></dd>
              <dt>Mobile</dt><dd>{profile.mobile || '—'}</dd>
              <dt>Household</dt><dd>{profile.is_household_head ? 'Head of household' : 'Member'}</dd>
            </dl>
          </div>
        </div>
      </div>
    </>
  )
}
