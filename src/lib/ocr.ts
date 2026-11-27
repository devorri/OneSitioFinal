export interface OcrResult {
  text: string
  idNumber: string | null
}

/** Runs Tesseract OCR in the browser (language data downloads on first use). */
export async function runOcr(file: Blob, onProgress?: (p: number, status: string) => void): Promise<OcrResult> {
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker('eng', 1, {
    logger: (m) => onProgress?.(typeof m.progress === 'number' ? m.progress : 0, m.status),
  })
  try {
    const { data } = await worker.recognize(file)
    const text = (data.text || '').replace(/\n{3,}/g, '\n\n').trim()
    return { text, idNumber: extractIdNumber(text) }
  } finally {
    await worker.terminate()
  }
}

/** Best-effort ID number detection for common PH IDs. */
export function extractIdNumber(text: string): string | null {
  const t = text.toUpperCase()
  const patterns = [
    /\b\d{4}[-\s]\d{4}[-\s]\d{4}[-\s]\d{4}\b/, // PhilSys PCN
    /\b\d{4}[-\s]\d{7}[-\s]\d\b/, // UMID CRN
    /\b[A-Z]\d{2}[-\s]\d{2}[-\s]\d{6}\b/, // LTO license
    /\b[A-Z]{1,2}\d{7}[A-Z]?\b/, // passport
    /\b\d{4}[-\s]\d{4}[-\s]\d{4}\b/,
    /\b\d{8,16}\b/,
  ]
  for (const re of patterns) {
    const m = t.match(re)
    if (m) return m[0].replace(/\s+/g, '-')
  }
  return null
}

/** True when both names appear somewhere in the OCR text. */
export function nameFoundInText(text: string, first: string, last: string) {
  const norm = (s: string) => s.toUpperCase().replace(/[^A-ZÑ]/g, '')
  const hay = norm(text)
  const f = norm(first.split(' ')[0] || '')
  const l = norm(last)
  return f.length > 1 && l.length > 1 && hay.includes(f) && hay.includes(l)
}
