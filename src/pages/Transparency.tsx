import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { usePageTitle } from '../usePageTitle'
import { fmtDateTime, fundLabel, ledgerTypeLabel, peso, pesoRound } from '../lib/format'
import { verifyChain, type BlockCheck } from '../lib/ledger'
import type { Fund, FundSummary, LedgerBlock } from '../lib/types'
import { Modal } from '../components/ui'

export default function Transparency() {
  usePageTitle('Transparency ledger • OneSitio')
  const [blocks, setBlocks] = useState<LedgerBlock[]>([])
  const [funds, setFunds] = useState<FundSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [fund, setFund] = useState<Fund | 'all'>('all')
  const [checks, setChecks] = useState<Map<number, BlockCheck> | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [open, setOpen] = useState<LedgerBlock | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      supabase.from('ledger_blocks').select('*').order('block_number', { ascending: false }),
      supabase.from('fund_summary').select('*'),
    ]).then(([b, f]) => {
      if (cancelled) return
      setBlocks((b.data as LedgerBlock[]) ?? [])
      setFunds((f.data as FundSummary[]) ?? [])
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const shown = useMemo(() => (fund === 'all' ? blocks : blocks.filter((b) => b.fund === fund)), [blocks, fund])

  const verify = async () => {
    setVerifying(true)
    setChecks(await verifyChain(blocks))
    setVerifying(false)
  }

  const allOk = checks ? [...checks.values()].every((c) => c.hashOk && c.linkOk) : null

  return (
    <div className="container py-5">
      <div className="page-head">
        <div>
          <span className="eyebrow">Public ledger</span>
          <h1 className="mt-1">Transparency ledger</h1>
          <p className="page-sub">Every allocation, collection, and expense of Barangay Talampas, chained with SHA-256.</p>
        </div>
        <button type="button" className="btn btn-ink" onClick={verify} disabled={verifying || blocks.length === 0}>
          {verifying ? <span className="spinner-border spinner-border-sm" aria-hidden="true"></span> : <i className="bi bi-shield-check"></i>}
          Verify chain in my browser
        </button>
      </div>

      {allOk !== null && (
        <div className={`note ${allOk ? 'note-ok' : 'note-bad'} mb-4`}>
          <i className={`bi ${allOk ? 'bi-check-circle' : 'bi-exclamation-triangle'}`}></i>
          <span>
            {allOk
              ? `All ${blocks.length} blocks check out. Every hash matches its contents and links to the block before it.`
              : 'Some blocks failed verification — the marked entries were altered after they were recorded.'}
          </span>
        </div>
      )}

      <div className="row g-3 mb-4">
        {(['general', 'development', 'digital_revenue'] as const).map((f) => {
          const s = funds.find((x) => x.fund === f)
          return (
            <div className="col-md-4" key={f}>
              <div className="panel stat">
                <span className="stat-label">{fundLabel[f]}</span>
                <span className="stat-value">{pesoRound(s?.balance ?? 0)}</span>
                <span className="stat-sub">
                  In {pesoRound((s?.allocated ?? 0) + (s?.collected ?? 0))} · Out {pesoRound(s?.disbursed ?? 0)}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>Blocks</h2>
          <div className="seg">
            {(['all', 'general', 'development', 'digital_revenue'] as const).map((f) => (
              <button type="button" key={f} className={fund === f ? 'active' : ''} onClick={() => setFund(f)}>
                {f === 'all' ? 'All' : fundLabel[f]}
              </button>
            ))}
          </div>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr><th>Block</th><th>Entry</th><th>Fund</th><th className="text-end">Amount</th><th>Hash</th><th></th></tr>
            </thead>
            <tbody>
              {shown.map((b) => {
                const c = checks?.get(b.block_number)
                return (
                  <tr key={b.block_number} className="clickable" onClick={() => setOpen(b)}>
                    <td className="mono">#{b.block_number}</td>
                    <td>
                      <div className="fw-medium">{b.title}</div>
                      <div className="small text-muted">{ledgerTypeLabel[b.entry_type]} · {fmtDateTime(b.created_at)}</div>
                    </td>
                    <td className="small">{fundLabel[b.fund]}</td>
                    <td className={`text-end mono ${b.amount > 0 ? 'amount-in' : b.amount < 0 ? 'amount-out' : ''}`}>
                      {b.amount > 0 ? '+' : ''}{peso(b.amount)}
                    </td>
                    <td className="hash">{b.hash.slice(0, 16)}…</td>
                    <td className="text-end">
                      {c && (c.hashOk && c.linkOk
                        ? <i className="bi bi-check-circle" style={{ color: 'var(--ok)' }} title="Verified"></i>
                        : <i className="bi bi-x-circle" style={{ color: 'var(--bad)' }} title="Failed"></i>)}
                    </td>
                  </tr>
                )
              })}
              {!loading && shown.length === 0 && (
                <tr><td colSpan={6} className="text-muted">No entries.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={!!open} onClose={() => setOpen(null)} title={open ? `Block #${open.block_number}` : ''} wide>
        {open && (
          <>
            <dl className="kv mb-3">
              <dt>Entry</dt><dd>{open.title}</dd>
              <dt>Description</dt><dd>{open.description || '—'}</dd>
              <dt>Type</dt><dd>{ledgerTypeLabel[open.entry_type]}</dd>
              <dt>Fund</dt><dd>{fundLabel[open.fund]}</dd>
              <dt>Amount</dt><dd className="mono">{peso(open.amount)}</dd>
              <dt>Reference</dt><dd className="mono">{open.reference || '—'}</dd>
              <dt>Recorded</dt><dd>{fmtDateTime(open.created_at)}</dd>
              <dt>Previous hash</dt><dd className="hash">{open.prev_hash}</dd>
              <dt>Hash</dt><dd className="hash">{open.hash}</dd>
            </dl>
            <div className="form-label">Hashed payload — sha256(payload) = hash</div>
            <div className="ocr-box">{open.payload}</div>
          </>
        )}
      </Modal>
    </div>
  )
}
