import { useEffect, useMemo, useState } from 'react'
import { nameFoundInText, runOcr } from '../lib/ocr'
import { errMsg } from '../lib/format'

interface Props {
  file: File | null
  onFile: (f: File | null) => void
  idNumber: string
  onIdNumber: (v: string) => void
  ocrText: string
  onOcrText: (v: string) => void
  firstName?: string
  lastName?: string
}

export default function IdOcrField({ file, onFile, idNumber, onIdNumber, ocrText, onOcrText, firstName = '', lastName = '' }: Props) {
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file])
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [showText, setShowText] = useState(false)

  const scan = async () => {
    if (!file) return
    setRunning(true)
    setError('')
    setProgress(0)
    try {
      const res = await runOcr(file, (p, s) => {
        setProgress(p)
        setStatus(s)
      })
      onOcrText(res.text)
      if (res.idNumber && !idNumber.trim()) onIdNumber(res.idNumber)
      if (!res.text) setError('No readable text found. Try a clearer, well-lit photo.')
    } catch (e) {
      setError('OCR failed: ' + errMsg(e))
    } finally {
      setRunning(false)
    }
  }

  const nameMatch = ocrText && firstName && lastName ? nameFoundInText(ocrText, firstName, lastName) : null

  return (
    <div>
      <label className="form-label">Photo of your valid ID</label>
      <input
        type="file"
        className="form-control"
        accept="image/*"
        onChange={(e) => {
          onFile(e.target.files?.[0] ?? null)
          onOcrText('')
        }}
      />
      <div className="form-text">Clear photo, all four corners visible, no glare. JPG or PNG.</div>

      {preview && (
        <div className="row g-3 mt-1">
          <div className="col-md-6">
            <div className="media-frame">
              <img src={preview} alt="ID preview" />
            </div>
          </div>
          <div className="col-md-6 d-flex flex-column gap-2">
            <button type="button" className="btn btn-line align-self-start" onClick={scan} disabled={running}>
              {running ? (
                <>
                  <span className="spinner-border spinner-border-sm" aria-hidden="true"></span> Reading ID…
                </>
              ) : (
                <>
                  <i className="bi bi-upc-scan"></i> {ocrText ? 'Read again' : 'Read ID with OCR'}
                </>
              )}
            </button>

            {running && (
              <div>
                <div className="progress-thin"><span style={{ width: `${Math.round(progress * 100)}%` }}></span></div>
                <div className="form-text text-capitalize">{status}</div>
              </div>
            )}

            {error && <div className="field-error">{error}</div>}

            {ocrText && !running && (
              <>
                {nameMatch !== null && (
                  <div className={`note ${nameMatch ? 'note-ok' : 'note-warn'} py-2`}>
                    <i className={`bi ${nameMatch ? 'bi-check-circle' : 'bi-exclamation-circle'}`}></i>
                    <span>{nameMatch ? 'Your name was found on the ID.' : 'We couldn’t find your name on the ID — the secretary will check it manually.'}</span>
                  </div>
                )}
                <button type="button" className="btn btn-ghost btn-sm align-self-start" onClick={() => setShowText((v) => !v)}>
                  {showText ? 'Hide' : 'Show'} extracted text
                </button>
                {showText && <div className="ocr-box">{ocrText}</div>}
              </>
            )}

            <div className="mt-auto">
              <label className="form-label">ID number</label>
              <input className="form-control mono" value={idNumber} onChange={(e) => onIdNumber(e.target.value)} placeholder="Auto-filled after OCR, or type it" />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
