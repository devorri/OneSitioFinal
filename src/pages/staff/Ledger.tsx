import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../../supabaseClient'
import { usePageTitle } from '../../usePageTitle'
import { errMsg, fmtDateTime, fundLabel, ledgerTypeLabel, peso } from '../../lib/format'
import { verifyChain, type BlockCheck } from '../../lib/ledger'
import type { Fund, LedgerBlock, LedgerType, Project } from '../../lib/types'
import { Modal, PageLoader } from '../../components/ui'

const ENTRY_TYPES: { value: LedgerType; label: string; sign: 1 | -1 }[] = [
  { value: 'allocation', label: 'Allocation (budget in)', sign: 1 },
  { value: 'disbursement', label: 'Disbursement (money out)', sign: -1 },
  { value: 'collection', label: 'Collection (other income)', sign: 1 },
  { value: 'adjustment', label: 'Adjustment (correction)', sign: 1 },
]

export default function Ledger() {
  usePageTitle('Ledger • OneSitio')
  const [blocks, setBlocks] = useState<LedgerBlock[] | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [checks, setChecks] = useState<Map<number, BlockCheck> | null>(null)
  const [adding, setAdding] = useState(false)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      supabase.from('ledger_blocks').select('*').order('block_number', { ascending: false }),
      supabase.from('projects').select('*').order('title'),
    ]).then(([b, p]) => {
      if (cancelled) return
      setBlocks((b.data as LedgerBlock[]) ?? [])
      setProjects((p.data as Project[]) ?? [])
    })
    return () => {
      cancelled = true
    }
  }, [reload])

  if (blocks === null) return <PageLoader />

  const allOk = checks ? [...checks.values()].every((c) => c.hashOk && c.linkOk) : null

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Ledger</h1>
          <p className="page-sub">Append-only. Entries can’t be edited or deleted — post an adjustment to correct a mistake.</p>
        </div>
        <div className="d-flex gap-2">
          <button type="button" className="btn btn-line" onClick={async () => setChecks(await verifyChain(blocks))}>
            <i className="bi bi-shield-check"></i> Verify chain
          </button>
          <button type="button" className="btn btn-ink" onClick={() => setAdding(true)}>
            <i className="bi bi-plus-lg"></i> New entry
          </button>
        </div>
      </div>

      {allOk !== null && (
        <div className={`note ${allOk ? 'note-ok' : 'note-bad'} mb-3`}>
          <i className={`bi ${allOk ? 'bi-check-circle' : 'bi-exclamation-triangle'}`}></i>
          <span>{allOk ? `All ${blocks.length} blocks verified.` : 'Chain verification failed — see marked rows.'}</span>
        </div>
      )}

      <div className="panel">
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Block</th><th>Entry</th><th>Fund</th><th className="text-end">Amount</th><th>Reference</th><th>Hash</th><th></th></tr></thead>
            <tbody>
              {blocks.map((b) => {
                const c = checks?.get(b.block_number)
                return (
                  <tr key={b.block_number}>
                    <td className="mono">#{b.block_number}</td>
                    <td>
                      <div className="fw-medium">{b.title}</div>
                      <div className="small text-muted">{ledgerTypeLabel[b.entry_type]} · {fmtDateTime(b.created_at)}</div>
                    </td>
                    <td className="small">{fundLabel[b.fund]}</td>
                    <td className={`text-end mono ${b.amount > 0 ? 'amount-in' : b.amount < 0 ? 'amount-out' : ''}`}>{b.amount > 0 ? '+' : ''}{peso(b.amount)}</td>
                    <td className="small mono">{b.reference || '—'}</td>
                    <td className="hash">{b.hash.slice(0, 12)}…</td>
                    <td>{c && <i className={`bi ${c.hashOk && c.linkOk ? 'bi-check-circle' : 'bi-x-circle'}`} style={{ color: c.hashOk && c.linkOk ? 'var(--ok)' : 'var(--bad)' }}></i>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {adding && <EntryModal projects={projects} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); setChecks(null); setReload((n) => n + 1) }} />}
    </>
  )
}

function EntryModal({ projects, onClose, onSaved }: { projects: Project[]; onClose: () => void; onSaved: () => void }) {
  const [type, setType] = useState<LedgerType>('disbursement')
  const [fund, setFund] = useState<Fund>('development')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [reference, setReference] = useState('')
  const [projectId, setProjectId] = useState('')
  const [negative, setNegative] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const sign = type === 'adjustment' ? (negative ? -1 : 1) : ENTRY_TYPES.find((e) => e.value === type)!.sign

  const save = async (e?: FormEvent) => {
    e?.preventDefault()
    const value = Number(amount)
    if (!title.trim()) return setError('Title is required.')
    if (!Number.isFinite(value) || value <= 0) return setError('Enter an amount greater than zero.')
    if (!window.confirm('Ledger entries are permanent and public. Post this entry?')) return
    setSaving(true)
    const { error: insErr } = await supabase.from('ledger_blocks').insert({
      entry_type: type,
      fund,
      title: title.trim(),
      description: description.trim() || null,
      amount: sign * value,
      reference: reference.trim() || null,
      project_id: projectId || null,
      // block_number, prev_hash, hash, payload and created_at are set by the database trigger
    })
    setSaving(false)
    if (insErr) return setError(errMsg(insErr))
    onSaved()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="New ledger entry"
      footer={
        <>
          <button type="button" className="btn btn-line" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-ink" onClick={() => save()} disabled={saving}>Post entry</button>
        </>
      }
    >
      <form className="d-grid gap-3" onSubmit={save}>
        <div className="row g-3">
          <div className="col-md-6">
            <label className="form-label">Type</label>
            <select className="form-select" value={type} onChange={(e) => setType(e.target.value as LedgerType)}>
              {ENTRY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="col-md-6">
            <label className="form-label">Fund</label>
            <select className="form-select" value={fund} onChange={(e) => setFund(e.target.value as Fund)}>
              {(Object.keys(fundLabel) as Fund[]).map((f) => <option key={f} value={f}>{fundLabel[f]}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="form-label">Title</label>
          <input className="form-control" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Flood Mitigation — progress billing 2" />
        </div>
        <div>
          <label className="form-label">Description <span className="text-muted">(optional)</span></label>
          <input className="form-control" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Payee, purpose, or note" />
        </div>
        <div className="row g-3">
          <div className="col-md-6">
            <label className="form-label">Amount (₱)</label>
            <input type="number" min="0" step="0.01" className="form-control" value={amount} onChange={(e) => setAmount(e.target.value)} />
            {type === 'adjustment' && (
              <div className="form-check mt-2">
                <input className="form-check-input" type="checkbox" id="neg" checked={negative} onChange={(e) => setNegative(e.target.checked)} />
                <label className="form-check-label small" htmlFor="neg">Deduct (negative adjustment)</label>
              </div>
            )}
          </div>
          <div className="col-md-6">
            <label className="form-label">Reference no. <span className="text-muted">(optional)</span></label>
            <input className="form-control mono" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="DV-2026-014" />
          </div>
        </div>
        <div>
          <label className="form-label">Related project <span className="text-muted">(optional)</span></label>
          <select className="form-select" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">None</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        </div>
        <div className="small text-muted">
          Will be recorded as <strong className={sign < 0 ? 'amount-out' : 'amount-in'}>{sign < 0 ? '−' : '+'}{peso(Number(amount) || 0)}</strong> in {fundLabel[fund]}.
        </div>
        {error && <div className="field-error">{error}</div>}
      </form>
    </Modal>
  )
}
