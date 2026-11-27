import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import { FULL_CROP, loadBitmap, renderRotated, scanId, type CropRect, type OcrResult } from '../lib/ocr'
import { ageFrom, errMsg, fmtDate } from '../lib/format'

interface Props {
  file: File | null
  onFile: (f: File | null) => void
  onScanned: (r: OcrResult) => void
}

type Drag = { mode: 'move' | 'nw' | 'ne' | 'sw' | 'se'; startX: number; startY: number; start: CropRect }

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export default function IdScanner({ file, onFile, onScanned }: Props) {
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null)
  const [rotation, setRotation] = useState(0)
  const [crop, setCrop] = useState<CropRect>(FULL_CROP)
  const [adjusting, setAdjusting] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [label, setLabel] = useState('')
  const [error, setError] = useState('')
  const [result, setResult] = useState<OcrResult | null>(null)
  const [showText, setShowText] = useState(false)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)

  // draw the (rotated) preview
  useEffect(() => {
    const c = canvasRef.current
    if (!c || !bitmap) return
    const r = renderRotated(bitmap, rotation, 900)
    c.width = r.width
    c.height = r.height
    c.getContext('2d')?.drawImage(r, 0, 0)
  }, [bitmap, rotation, adjusting])

  useEffect(() => () => bitmap?.close(), [bitmap])

  const scan = async (f: File, opts: { rotation?: number; crop?: CropRect }) => {
    setScanning(true)
    setError('')
    setProgress(0)
    try {
      const r = await scanId(f, opts, (p, l) => {
        setProgress(p)
        setLabel(l)
      })
      setResult(r)
      setRotation(r.rotation)
      setCrop(r.crop)
      onScanned(r)
      const found = [r.parsed.firstName || r.parsed.lastName, r.parsed.birthDate, r.parsed.idNumber].filter(Boolean).length
      if (found < 2) setAdjusting(true)
    } catch (e) {
      setError('Couldn’t read this photo: ' + errMsg(e))
    } finally {
      setScanning(false)
    }
  }

  const pick = async (f: File | null) => {
    onFile(f)
    setResult(null)
    setCrop(FULL_CROP)
    setAdjusting(false)
    setError('')
    if (!f) {
      setBitmap(null)
      return
    }
    try {
      setBitmap(await loadBitmap(f))
    } catch {
      setError('This file isn’t a readable image. Please upload a JPG or PNG photo.')
      return
    }
    scan(f, {})
  }

  // ---- crop box dragging ----
  const point = (e: RPointerEvent) => {
    const r = frameRef.current!.getBoundingClientRect()
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }
  }
  const startDrag = (e: RPointerEvent<HTMLElement>) => {
    e.preventDefault()
    e.stopPropagation()
    const mode = (e.currentTarget.dataset.mode ?? 'move') as Drag['mode']
    const p = point(e)
    drag.current = { mode, startX: p.x, startY: p.y, start: crop }
    frameRef.current?.setPointerCapture(e.pointerId)
  }
  const onMove = (e: RPointerEvent) => {
    const d = drag.current
    if (!d) return
    const p = point(e)
    const dx = p.x - d.startX
    const dy = p.y - d.startY
    const s = d.start
    const MIN = 0.1
    let { x, y, w, h } = s
    if (d.mode === 'move') {
      x = clamp(s.x + dx, 0, 1 - s.w)
      y = clamp(s.y + dy, 0, 1 - s.h)
    } else {
      if (d.mode.includes('w')) { x = clamp(s.x + dx, 0, s.x + s.w - MIN); w = s.x + s.w - x }
      if (d.mode.includes('e')) { w = clamp(s.w + dx, MIN, 1 - s.x) }
      if (d.mode.includes('n')) { y = clamp(s.y + dy, 0, s.y + s.h - MIN); h = s.y + s.h - y }
      if (d.mode.includes('s')) { h = clamp(s.h + dy, MIN, 1 - s.y) }
    }
    setCrop({ x, y, w, h })
  }
  const endDrag = () => {
    drag.current = null
  }

  const p = result?.parsed
  const age = ageFrom(p?.birthDate)
  const rows: [string, string | null][] = p
    ? [
        ['Name', [p.firstName, p.middleName, p.lastName, p.suffix].filter(Boolean).join(' ') || null],
        ['Birth date', p.birthDate ? `${fmtDate(p.birthDate)}${age !== null ? ` · ${age} years old` : ''}` : null],
        ['ID number', p.idNumber || null],
        ['Address', p.address || null],
      ]
    : []
  const weak = !!p && rows.filter(([, v]) => v).length < 3

  return (
    <div>
      <label className="form-label">Photo of your valid ID</label>
      <input type="file" className="form-control" accept="image/*" onChange={(e) => pick(e.target.files?.[0] ?? null)} disabled={scanning} />
      <div className="form-text">Lay the ID flat in good light, fill the frame, and avoid glare. We’ll read it automatically.</div>
      {error && <div className="field-error">{error}</div>}

      {file && bitmap && (
        <div className="row g-3 mt-1">
          <div className="col-md-6">
            <div
              ref={frameRef}
              className={`scan-frame ${adjusting ? 'adjusting' : ''}`}
              onPointerMove={onMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            >
              <canvas ref={canvasRef} className="scan-canvas" />
              {adjusting && (
                <div
                  className="crop-box"
                  style={{ left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.w * 100}%`, height: `${crop.h * 100}%` }}
                  data-mode="move"
                  onPointerDown={startDrag}
                >
                  {(['nw', 'ne', 'sw', 'se'] as const).map((c) => (
                    <span key={c} className={`crop-handle ${c}`} data-mode={c} onPointerDown={startDrag} />
                  ))}
                </div>
              )}
              {scanning && <div className="scan-line" />}
            </div>

            {adjusting ? (
              <div className="mt-3 d-grid gap-2">
                <div className="small text-muted">Drag the box tightly around the card, and straighten it until the text is level.</div>
                <div className="d-flex align-items-center gap-2">
                  <button type="button" className="icon-btn" onClick={() => setRotation((r) => r - 1)} aria-label="Rotate left"><i className="bi bi-arrow-counterclockwise"></i></button>
                  <input type="range" className="form-range" min={-30} max={30} step={0.5} value={rotation} onChange={(e) => setRotation(Number(e.target.value))} aria-label="Rotation" />
                  <button type="button" className="icon-btn" onClick={() => setRotation((r) => r + 1)} aria-label="Rotate right"><i className="bi bi-arrow-clockwise"></i></button>
                  <span className="small mono" style={{ width: 48, textAlign: 'right' }}>{rotation}°</span>
                </div>
                <div className="d-flex flex-wrap gap-2">
                  <button type="button" className="btn btn-ink btn-sm" onClick={() => file && scan(file, { rotation, crop })} disabled={scanning}>
                    <i className="bi bi-upc-scan"></i> Read again
                  </button>
                  <button type="button" className="btn btn-line btn-sm" onClick={() => setCrop(FULL_CROP)} disabled={scanning}>Reset crop</button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAdjusting(false)} disabled={scanning}>Done</button>
                </div>
              </div>
            ) : (
              result && !scanning && (
                <button type="button" className="btn btn-ghost btn-sm mt-2" onClick={() => setAdjusting(true)}>
                  <i className="bi bi-crop"></i> Adjust photo
                </button>
              )
            )}
          </div>

          <div className="col-md-6">
            {scanning && (
              <div className="py-2">
                <div className="fw-medium mb-2">{label || 'Reading ID'}…</div>
                <div className="progress-thin"><span style={{ width: `${Math.round(progress * 100)}%` }}></span></div>
                <div className="form-text">First scan downloads the OCR engine (~10 MB). Later scans are faster.</div>
              </div>
            )}

            {!scanning && p && (
              <>
                <div className="fw-medium mb-2">Read from your ID</div>
                <ul className="scan-results">
                  {rows.map(([k, v]) => (
                    <li key={k}>
                      <i className={`bi ${v ? 'bi-check-circle-fill ok' : 'bi-dash-circle miss'}`}></i>
                      <span className="k">{k}</span>
                      <span className="v">{v ?? 'Not found'}</span>
                    </li>
                  ))}
                </ul>
                {weak ? (
                  <div className="note note-warn py-2 mt-2">
                    <i className="bi bi-lightbulb"></i>
                    <span>Some details couldn’t be read. Crop closer to the card and straighten it, then tap <strong>Read again</strong> — or just type them on the next step.</span>
                  </div>
                ) : (
                  <div className="note note-ok py-2 mt-2">
                    <i className="bi bi-check-circle"></i>
                    <span>We filled in your details. You can review and correct them on the next step.</span>
                  </div>
                )}
                <button type="button" className="btn btn-ghost btn-sm mt-2" onClick={() => setShowText((v) => !v)}>
                  {showText ? 'Hide' : 'Show'} raw text
                </button>
                {showText && <div className="ocr-box mt-1">{result?.text}</div>}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
