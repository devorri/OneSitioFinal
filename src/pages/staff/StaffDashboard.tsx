import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../auth/context'
import { usePageTitle } from '../../usePageTitle'
import { fmtDate, peso, pesoRound } from '../../lib/format'
import type { DocumentRequest, FundSummary } from '../../lib/types'
import { EmptyState, PageLoader, PaymentPill, RequestStatusPill } from '../../components/ui'

interface Stats {
  verifications: number
  open: number
  toPay: number
  ready: number
}

export default function StaffDashboard() {
  usePageTitle('Staff overview • OneSitio')
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [stats, setStats] = useState<Stats | null>(null)
  const [recent, setRecent] = useState<DocumentRequest[]>([])
  const [funds, setFunds] = useState<FundSummary[]>([])

  useEffect(() => {
    let cancelled = false
    const count = (q: PromiseLike<{ count: number | null }>) => q.then((r) => r.count ?? 0)
    Promise.all([
      count(supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('verification_status', 'pending')),
      count(supabase.from('document_requests').select('id', { count: 'exact', head: true }).in('status', ['pending', 'under_review'])),
      count(supabase.from('document_requests').select('id', { count: 'exact', head: true }).eq('status', 'approved').eq('payment_status', 'unpaid')),
      count(supabase.from('document_requests').select('id', { count: 'exact', head: true }).eq('status', 'ready')),
      supabase.from('document_requests').select('*, document_types(name), profiles(first_name,last_name,resident_code)').order('created_at', { ascending: false }).limit(8),
      supabase.from('fund_summary').select('*'),
    ]).then(([verifications, open, toPay, ready, r, f]) => {
      if (cancelled) return
      setStats({ verifications, open, toPay, ready })
      setRecent((r.data as DocumentRequest[]) ?? [])
      setFunds((f.data as FundSummary[]) ?? [])
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (!stats) return <PageLoader />

  const collected = funds.reduce((s, f) => s + Number(f.collected), 0)

  const cards = [
    { label: 'IDs to verify', value: stats.verifications, to: '/staff/residents' },
    { label: 'Requests to process', value: stats.open, to: '/staff/requests' },
    { label: 'Awaiting payment', value: stats.toPay, to: '/staff/requests?filter=approved' },
    { label: 'Ready for pickup', value: stats.ready, to: '/staff/requests?filter=ready' },
  ]

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Overview</h1>
          <p className="page-sub">Logged in as {profile?.first_name} · <span className="text-capitalize">{profile?.role}</span></p>
        </div>
      </div>

      <div className="row g-3 mb-4">
        {cards.map((c) => (
          <div className="col-6 col-lg-3" key={c.label}>
            <Link to={c.to} className="panel stat d-block text-decoration-none">
              <span className="stat-label">{c.label}</span>
              <span className="stat-value">{c.value}</span>
            </Link>
          </div>
        ))}
      </div>

      <div className="row g-3">
        <div className="col-lg-8">
          <div className="panel h-100">
            <div className="panel-head">
              <h2>Latest requests</h2>
              <Link to="/staff/requests" className="small">View all</Link>
            </div>
            {recent.length === 0 ? (
              <EmptyState title="No requests yet" />
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead><tr><th>Request</th><th>Resident</th><th>Filed</th><th>Fee</th><th className="text-end">Status</th></tr></thead>
                  <tbody>
                    {recent.map((r) => (
                      <tr key={r.id} className="clickable" onClick={() => navigate(`/staff/requests?open=${r.id}`)}>
                        <td>
                          <div className="fw-medium">{r.document_types?.name}</div>
                          <div className="small text-muted mono">{r.reference_code}</div>
                        </td>
                        <td className="small">{r.profiles ? `${r.profiles.first_name} ${r.profiles.last_name}` : '—'}</td>
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
        </div>
        <div className="col-lg-4">
          <div className="panel h-100">
            <div className="panel-head"><h2>Collections</h2></div>
            <div className="stat mb-3">
              <span className="stat-label">Total document fees collected</span>
              <span className="stat-value">{pesoRound(collected)}</span>
            </div>
            <p className="small text-muted">Every payment is added to the public ledger automatically.</p>
            <Link to="/staff/ledger" className="btn btn-line btn-sm">Open ledger</Link>
          </div>
        </div>
      </div>
    </>
  )
}
