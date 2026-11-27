import { useEffect, useMemo, useRef, useState } from 'react'

export default function SelfieCapture({ value, onChange }: { value: Blob | null; onChange: (b: Blob | null) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [cameraOn, setCameraOn] = useState(false)
  const [error, setError] = useState('')

  const preview = useMemo(() => (value ? URL.createObjectURL(value) : null), [value])
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  const stop = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setCameraOn(false)
  }

  useEffect(() => () => streamRef.current?.getTracks().forEach((t) => t.stop()), [])

  const start = async () => {
    setError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 720, height: 720 } })
      streamRef.current = stream
      setCameraOn(true)
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.play().catch(() => undefined)
        }
      })
    } catch {
      setError('Camera not available. You can upload a photo instead.')
    }
  }

  const capture = () => {
    const video = videoRef.current
    if (!video || !video.videoWidth) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.translate(canvas.width, 0)
    ctx.scale(-1, 1)
    ctx.drawImage(video, 0, 0)
    canvas.toBlob((blob) => {
      if (blob) onChange(blob)
      stop()
    }, 'image/jpeg', 0.9)
  }

  return (
    <div>
      <div className="media-frame" style={{ maxWidth: 360, aspectRatio: '1', minHeight: 0 }}>
        {cameraOn ? (
          <video ref={videoRef} playsInline muted style={{ transform: 'scaleX(-1)', objectFit: 'cover', height: '100%' }} />
        ) : preview ? (
          <img src={preview} alt="Selfie preview" style={{ objectFit: 'cover', height: '100%', maxHeight: 'none' }} />
        ) : (
          <div className="text-center text-muted p-4">
            <i className="bi bi-person-bounding-box fs-2 d-block mb-2"></i>
            No photo yet
          </div>
        )}
      </div>

      <div className="d-flex flex-wrap gap-2 mt-3">
        {cameraOn ? (
          <>
            <button type="button" className="btn btn-ink" onClick={capture}>
              <i className="bi bi-camera"></i> Take photo
            </button>
            <button type="button" className="btn btn-line" onClick={stop}>Cancel</button>
          </>
        ) : (
          <>
            <button type="button" className="btn btn-ink" onClick={start}>
              <i className="bi bi-camera"></i> {value ? 'Retake with camera' : 'Use camera'}
            </button>
            <label className="btn btn-line mb-0">
              <i className="bi bi-upload"></i> Upload photo
              <input type="file" accept="image/*" capture="user" hidden onChange={(e) => onChange(e.target.files?.[0] ?? null)} />
            </label>
          </>
        )}
      </div>
      {error && <div className="field-error">{error}</div>}
    </div>
  )
}
