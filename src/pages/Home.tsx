import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { usePageTitle } from '../usePageTitle'
import { useAuth } from '../auth/context'
import { fmtDate, fmtDateTime, fundLabel, ledgerTypeLabel, peso, pesoRound, projectStatusMeta } from '../lib/format'
import type { DocumentType, FundSummary, LedgerBlock, Project, TrackResult } from '../lib/types'
import { PaymentPill, PhSun, Pill, RequestStatusPill } from '../components/ui'
import RequestStepper from '../components/RequestStepper'

const FAQS = [
  {
    q: 'Sino ang maaaring gumawa ng OneSitio account?',
    a: 'Lahat ng residente ng Barangay Talampas na 15 taong gulang pataas. Para sa edad 15–17, puwede ang School ID. Ang head of household ay puwedeng mag-request para sa mga anak o nakatatandang kasama sa bahay.',
  },
  {
    q: 'Paano nabe-verify ang aking account?',
    a: 'I-upload ang litrato ng valid ID at isang selfie. Babasahin ng OCR ang ID para mapabilis ang pag-check, pero ang Kalihim ng Barangay pa rin ang mag-aapruba bago ka makapag-request.',
  },
  {
    q: 'Paano magbayad?',
    a: 'Kapag naaprubahan ang request, puwede kang magbayad online (GCash, Maya, QR Ph, o card) o ng cash sa Barangay Hall. Libre ang Certificate of Indigency.',
  },
  {
    q: 'Ano ang “tamper-evident” ledger?',
    a: 'Bawat alokasyon, koleksyon, at gastos ay naitatala bilang sunod-sunod na block na may SHA-256 hash ng nauna. Kapag may binago, masisira ang chain — at puwede itong i-check ng kahit sino sa Transparency page.',
  },
]

export default function Home() {
  usePageTitle('OneSitio • Barangay Talampas, Bustos, Bulacan')
  const { session } = useAuth()

  const [docTypes, setDocTypes] = useState<DocumentType[]>([])
  const [funds, setFunds] = useState<FundSummary[]>([])
  const [blocks, setBlocks] = useState<LedgerBlock[]>([])
  const [projects, setProjects] = useState<Project[]>([])

  const [code, setCode] = useState('')
  const [tracking, setTracking] = useState(false)
  const [track, setTrack] = useState<TrackResult | null | undefined>(undefined)
  const [openFaq, setOpenFaq] = useState<number | null>(0)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      supabase.from('document_types').select('*').eq('active', true).order('sort_order'),
      supabase.from('fund_summary').select('*'),
      supabase.from('ledger_blocks').select('*').order('block_number', { ascending: false }).limit(5),
      supabase.from('projects').select('*').order('created_at').limit(6),
    ]).then(([d, f, b, p]) => {
      if (cancelled) return
      setDocTypes((d.data as DocumentType[]) ?? [])
      setFunds((f.data as FundSummary[]) ?? [])
      setBlocks((b.data as LedgerBlock[]) ?? [])
      setProjects((p.data as Project[]) ?? [])
    })
    return () => {
      cancelled = true
    }
  }, [])

  const doTrack = async (e: FormEvent) => {
    e.preventDefault()
    if (!code.trim()) return
    setTracking(true)
    const { data } = await supabase.rpc('track_request', { p_code: code.trim() })
    setTrack(((data as TrackResult[] | null) ?? [])[0] ?? null)
    setTracking(false)
  }

  const requestLink = (type: string) => (session ? `/app/request?type=${type}` : '/register')

  return (
    <>
      {/* HERO */}
      <section className="hero">
        <div className="container">
          <div className="row align-items-center g-5">
            <div className="col-lg-6">
              <span className="hero-kicker"><PhSun className="ph-sun" /> Mabuhay, Talampas!</span>
              <h1>
                Serbisyong barangay, <span className="accent-blue">nasa kamay</span> <span className="accent-red">mo</span>.
              </h1>
              <p className="hero-lead">
                Mag-request ng clearance at certificates online, subaybayan ang status, at tingnan kung saan napupunta ang pondo ng barangay.
              </p>
              <div className="d-flex flex-wrap gap-2 mt-4">
                {session ? (
                  <Link to="/app" className="btn btn-ink btn-lg">Open workspace <i className="bi bi-arrow-right"></i></Link>
                ) : (
                  <Link to="/register" className="btn btn-ink btn-lg">Register as resident</Link>
                )}
                <a href="#tracker" className="btn btn-line btn-lg">Track a request</a>
              </div>
            </div>
            <div className="col-lg-6">
              <div className="hero-figure">
                <div className="sunburst"></div>
                <img src="/images/login-hero.webp" alt="Mga Pilipino sa tradisyunal na kasuotan" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* TRACKER */}
      <section id="tracker" className="section" style={{ background: 'var(--soft)' }}>
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">Track a request</span>
            <h2>Nasaan na ang request ko?</h2>
            <p>Ilagay ang reference code (hal. REQ-1001). Hindi kailangang mag-log in.</p>
          </div>
          <div className="panel tracker-card">
            <form className="d-flex gap-2" onSubmit={doTrack}>
              <input
                className="form-control"
                placeholder="REQ-1001"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                aria-label="Reference code"
              />
              <button className="btn btn-ink px-4" disabled={tracking}>
                {tracking ? <span className="spinner-border spinner-border-sm" aria-hidden="true"></span> : 'Track'}
              </button>
            </form>

            {track === null && (
              <div className="note note-warn mt-3">
                <i className="bi bi-search"></i>
                <span>Walang request na may ganitong reference code. Pakisuri ang code.</span>
              </div>
            )}

            {track && (
              <div className="mt-4">
                <div className="d-flex flex-wrap justify-content-between gap-2 mb-3">
                  <div>
                    <div className="fw-semibold">{track.document_name}</div>
                    <div className="small text-muted">
                      <span className="mono">{track.reference_code}</span> · For {track.beneficiary} · Filed {fmtDate(track.created_at)}
                    </div>
                  </div>
                  <div className="d-flex gap-2 align-items-start">
                    <RequestStatusPill status={track.status} />
                    <PaymentPill status={track.payment_status} />
                  </div>
                </div>
                <RequestStepper status={track.status} paymentStatus={track.payment_status} />
                <div className="small text-muted mt-3">Last update: {fmtDateTime(track.updated_at)}</div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* SERVICES */}
      <section id="services" className="section">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">Documents</span>
            <h2>Mga dokumentong puwedeng i-request online</h2>
            <p>Para sa sarili o para sa mga kasama sa bahay. Kunin na lang sa Barangay Hall kapag ready na.</p>
          </div>
          <div className="row g-3">
            {docTypes.map((d) => (
              <div className="col-md-6 col-lg-3" key={d.code}>
                <div className="panel doc-card">
                  <h3>{d.name}</h3>
                  <p className="text-muted small mb-0">{d.description}</p>
                  <ul>
                    {d.requirements.map((r) => <li key={r}>{r}</li>)}
                    {d.processing_time && <li>{d.processing_time}</li>}
                  </ul>
                  <div className="d-flex justify-content-between align-items-center mt-auto">
                    <span className="price">{Number(d.fee) === 0 ? 'Free' : peso(d.fee)}</span>
                    <Link to={requestLink(d.code)} className="btn btn-line btn-sm">Request</Link>
                  </div>
                </div>
              </div>
            ))}
            {docTypes.length === 0 && <div className="col-12 text-muted">Loading documents…</div>}
          </div>
        </div>
      </section>

      {/* TRANSPARENCY */}
      <section className="section" style={{ background: 'var(--soft)' }}>
        <div className="container">
          <div className="d-flex flex-wrap justify-content-between align-items-end gap-3 section-head" style={{ maxWidth: 'none' }}>
            <div style={{ maxWidth: 620 }}>
              <span className="eyebrow">Transparency</span>
              <h2>Bukas na talaan ng pondo ng barangay</h2>
              <p>Bawat entry ay naka-link sa nauna gamit ang SHA-256. Kapag may nagbago, makikita agad.</p>
            </div>
            <Link to="/transparency" className="btn btn-line">Open full ledger <i className="bi bi-arrow-right"></i></Link>
          </div>

          <div className="row g-3 mb-3">
            {(['general', 'development', 'digital_revenue'] as const).map((f) => {
              const s = funds.find((x) => x.fund === f)
              return (
                <div className="col-md-4" key={f}>
                  <div className="panel stat">
                    <span className="stat-label">{fundLabel[f]}</span>
                    <span className="stat-value">{pesoRound(s?.balance ?? 0)}</span>
                    <span className="stat-sub">
                      {f === 'digital_revenue'
                        ? `${s?.entries ?? 0} online payments`
                        : `${pesoRound(s?.disbursed ?? 0)} spent of ${pesoRound(s?.allocated ?? 0)}`}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="panel">
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr><th>Block</th><th>Entry</th><th>Fund</th><th className="text-end">Amount</th><th>Hash</th></tr>
                </thead>
                <tbody>
                  {blocks.map((b) => (
                    <tr key={b.block_number}>
                      <td className="mono">#{b.block_number}</td>
                      <td>
                        <div className="fw-medium">{b.title}</div>
                        <div className="small text-muted">{ledgerTypeLabel[b.entry_type]} · {fmtDate(b.created_at)}</div>
                      </td>
                      <td className="small">{fundLabel[b.fund]}</td>
                      <td className={`text-end mono ${b.amount > 0 ? 'amount-in' : b.amount < 0 ? 'amount-out' : ''}`}>
                        {b.amount > 0 ? '+' : ''}{peso(b.amount)}
                      </td>
                      <td className="hash">{b.hash.slice(0, 12)}…</td>
                    </tr>
                  ))}
                  {blocks.length === 0 && (
                    <tr><td colSpan={5} className="text-muted">No ledger entries yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* PROJECTS */}
      <section id="projects" className="section">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">Projects</span>
            <h2>Mga proyekto ng Barangay Talampas</h2>
            <p>Budget, kontratista, at progreso ng bawat proyekto — walang ghost project.</p>
          </div>
          <div className="row g-3">
            {projects.map((p) => (
              <div className="col-md-6 col-lg-4" key={p.id}>
                <div className="panel project-card">
                  {p.image_url && <img src={p.image_url} alt={p.title} />}
                  <div className="body">
                    <div className="d-flex justify-content-between gap-2">
                      <Pill tone={projectStatusMeta[p.status].tone}>{projectStatusMeta[p.status].label}</Pill>
                      <span className="small text-muted">{p.location}</span>
                    </div>
                    <h3>{p.title}</h3>
                    <p className="small text-muted mb-0">{p.description}</p>
                    <dl className="kv mt-2" style={{ gridTemplateColumns: '110px 1fr', fontSize: '0.86rem' }}>
                      <dt>Budget</dt><dd>{peso(p.budget)}</dd>
                      <dt>Contractor</dt><dd>{p.contractor || 'For bidding'}</dd>
                    </dl>
                    <div className="mt-auto pt-2">
                      <div className="d-flex justify-content-between small mb-1">
                        <span className="text-muted">Progress</span><span>{p.progress}%</span>
                      </div>
                      <div className="progress-thin"><span style={{ width: `${p.progress}%` }}></span></div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="section" style={{ background: 'var(--soft)' }}>
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">How it works</span>
            <h2>Apat na hakbang lang</h2>
          </div>
          <div className="row g-3">
            {[
              ['Mag-register', 'Ilagay ang detalye mo, i-upload ang valid ID, at kumuha ng selfie.'],
              ['Ma-verify', 'Susuriin ng Kalihim ang ID mo. Makakatanggap ka ng update sa workspace.'],
              ['Mag-request at magbayad', 'Pumili ng dokumento at magbayad online kapag naaprubahan.'],
              ['Kunin sa Barangay Hall', 'Kapag “Ready for pickup” na, dalhin ang reference code at kunin ang dokumento.'],
            ].map(([t, d], i) => (
              <div className="col-md-6 col-lg-3" key={t}>
                <div className="panel h-100">
                  <span className="step-num">{i + 1}</span>
                  <h3 style={{ fontSize: '1.02rem' }}>{t}</h3>
                  <p className="text-muted small mb-0">{d}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="section">
        <div className="container" style={{ maxWidth: 820 }}>
          <div className="section-head">
            <span className="eyebrow">FAQ</span>
            <h2>Mga madalas itanong</h2>
          </div>
          {FAQS.map((f, i) => (
            <div className="faq-item" key={f.q}>
              <button type="button" className="faq-q" onClick={() => setOpenFaq(openFaq === i ? null : i)} aria-expanded={openFaq === i}>
                {f.q}
                <i className={`bi ${openFaq === i ? 'bi-dash' : 'bi-plus'}`}></i>
              </button>
              {openFaq === i && <div className="faq-a">{f.a}</div>}
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      {!session && (
        <section className="section pt-0">
          <div className="container">
            <div className="panel text-center py-5">
              <h2 className="mb-2">Handa ka na?</h2>
              <p className="text-muted mb-4">Gumawa ng account at hindi mo na kailangang pumila para sa clearance.</p>
              <div className="d-flex justify-content-center gap-2">
                <Link to="/register" className="btn btn-ink btn-lg">Register</Link>
                <Link to="/login" className="btn btn-line btn-lg">Log in</Link>
              </div>
            </div>
          </div>
        </section>
      )}
    </>
  )
}
