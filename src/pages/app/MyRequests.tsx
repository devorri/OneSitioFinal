import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../auth/context'
import { usePageTitle } from '../../usePageTitle'
import { fmtDate, peso } from '../../lib/format'
import type { DocumentRequest } from '../../lib/types'
import { EmptyState, PageLoader, PaymentPill, RequestStatusPill } from '../../components/ui'

const FILTERS = {
  all: { label: 'All', match: () => true },
  active: { label: 'In progress', match: (r: DocumentRequest) => ['pending', 'under_review', 'approved'].includes(r.status) },
  ready: { label: 'Ready', match: (r: DocumentRequest) => r.status === 'ready' },
  closed: { label: 'Closed', match: (r: DocumentRequest) => ['released', 'rejected', 'cancelled'].includes(r.status) },
} as const

export default function MyRequests() {
  usePageTitle('My requests • OneSitio')
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [rows, setRows] = useState<DocumentRequest[] | null>(null)
  const [filter, setFilter] = useState<keyof typeof FILTERS>('all')

  useEffect(() => {
    if (!profile) return
    let cancelled = false
    supabase
      .from('document_requests')
      .select('*, document_types(name)')
      .eq('requester_id', profile.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (!cancelled) setRows((data as DocumentRequest[]) ?? [])
      })
    return () => {
      cancelled = true
    }
  }, [profile])

  const shown = useMemo(() => (rows ?? []).filter(FILTERS[filter].match), [rows, filter])

  if (rows === null) return <PageLoader />

  return (
    <>
      <div className="page-head">
        <div>
          <h1>My requests</h1>
          <p className="page-sub">{rows.length} total</p>
        </div>
        <Link to="/app/request" className="btn btn-ink"><i className="bi bi-plus-lg"></i> New request</Link>
      </div>

      <div className="panel">
        <div className="panel-head">
          <div className="seg">
            {(Object.keys(FILTERS) as (keyof typeof FILTERS)[]).map((k) => (
              <button key={k} type="button" className={filter === k ? 'active' : ''} onClick={() => setFilter(k)}>
                {FILTERS[k].label}
              </button>
            ))}
          </div>
        </div>

        {shown.length === 0 ? (
          <EmptyState icon="bi-file-earmark" title="Nothing here" text="No requests match this filter." />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>Reference</th><th>Document</th><th>For</th><th>Filed</th><th>Fee</th><th className="text-end">Status</th></tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id} className="clickable" onClick={() => navigate(`/app/requests/${r.id}`)}>
                    <td className="mono">{r.reference_code}</td>
                    <td className="fw-medium">{r.document_types?.name}</td>
                    <td className="small">{r.beneficiary_name}</td>
                    <td className="small text-muted">{fmtDate(r.created_at)}</td>
                    <td className="small">
                      {Number(r.fee) === 0 ? 'Free' : peso(r.fee)}{' '}
                      {Number(r.fee) > 0 && <PaymentPill status={r.payment_status} fee={Number(r.fee)} />}
                    </td>
                    <td className="text-end"><RequestStatusPill status={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}
