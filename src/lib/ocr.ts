import { parseIdText, type ParsedId } from './idParser'

export interface CropRect {
  x: number // all 0..1, relative to the rotated image
  y: number
  w: number
  h: number
}

export const FULL_CROP: CropRect = { x: 0, y: 0, w: 1, h: 1 }

export interface OcrResult {
  text: string
  parsed: ParsedId
  confidence: number
  rotation: number
  crop: CropRect
}

const MAX_SOURCE = 2400 // longest side kept in memory (phone photos can be 4000px+)

function canvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(w))
  c.height = Math.max(1, Math.round(h))
  return c
}

export async function loadBitmap(file: Blob) {
  return createImageBitmap(file)
}

/** Draws the image rotated by `deg` (clockwise) onto a white canvas whose longest side is ≤ maxSide. */
export function renderRotated(img: ImageBitmap, deg: number, maxSide = MAX_SOURCE) {
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
  const w = img.width * scale
  const h = img.height * scale
  const rad = (deg * Math.PI) / 180
  const cw = Math.abs(w * Math.cos(rad)) + Math.abs(h * Math.sin(rad))
  const ch = Math.abs(w * Math.sin(rad)) + Math.abs(h * Math.cos(rad))
  const c = canvas(cw, ch)
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, c.width, c.height)
  ctx.translate(c.width / 2, c.height / 2)
  ctx.rotate(rad)
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, -w / 2, -h / 2, w, h)
  return c
}

/**
 * Finds how tilted the text is (−25°…25°). For each candidate angle, dark pixels are projected onto the
 * vertical axis; when the text is level, rows of text form sharp peaks, so the histogram is the "spikiest".
 */
export function detectSkew(img: ImageBitmap): number {
  const W = 500
  const H = Math.round((img.height * W) / img.width)
  const c = canvas(W, H)
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(img, 0, 0, W, H)
  const { data } = ctx.getImageData(0, 0, W, H)

  const lum = new Float32Array(W * H)
  let sum = 0
  for (let i = 0; i < lum.length; i++) {
    const v = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]
    lum[i] = v
    sum += v
  }
  const mean = sum / lum.length
  let varSum = 0
  for (let i = 0; i < lum.length; i++) varSum += (lum[i] - mean) ** 2
  const thr = mean - 0.6 * Math.sqrt(varSum / lum.length)

  const xs: number[] = []
  const ys: number[] = []
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (lum[y * W + x] < thr) {
        xs.push(x - W / 2)
        ys.push(y - H / 2)
      }
    }
  }
  if (xs.length < 300) return 0

  const size = Math.ceil(Math.hypot(W, H)) + 2
  const offset = size / 2
  const bins = new Float64Array(size)
  let best = 0
  let bestScore = -1
  for (let d = -25; d <= 25; d += 0.5) {
    const t = (d * Math.PI) / 180
    const s = Math.sin(t)
    const co = Math.cos(t)
    bins.fill(0)
    for (let i = 0; i < xs.length; i++) bins[Math.floor(xs[i] * s + ys[i] * co + offset)]++
    let score = 0
    for (let i = 1; i < size; i++) score += (bins[i] - bins[i - 1]) ** 2
    if (score > bestScore) {
      bestScore = score
      best = d
    }
  }
  return best
}

/**
 * Finds the ID card in a straightened photo by looking for the densest block of text-like pixels
 * (pixels much darker than their surroundings), so the table / background gets cropped away.
 */
export function autoCrop(img: ImageBitmap, deg: number): CropRect {
  const r = renderRotated(img, deg, 500)
  const W = r.width
  const H = r.height
  const { data } = r.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, W, H)
  const lum = new Float32Array(W * H)
  for (let i = 0; i < lum.length; i++) lum[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]

  // 9×9 box blur via an integral image
  const integ = new Float64Array((W + 1) * (H + 1))
  for (let y = 0; y < H; y++) {
    let row = 0
    for (let x = 0; x < W; x++) {
      row += lum[y * W + x]
      integ[(y + 1) * (W + 1) + x + 1] = integ[y * (W + 1) + x + 1] + row
    }
  }
  const R = 4
  const CELL = 10
  const gw = Math.floor(W / CELL)
  const gh = Math.floor(H / CELL)
  if (gw < 4 || gh < 4) return FULL_CROP
  const density = new Float32Array(gw * gh)
  for (let y = 0; y < gh * CELL; y++) {
    const y0 = Math.max(0, y - R)
    const y1 = Math.min(H, y + R + 1)
    for (let x = 0; x < gw * CELL; x++) {
      const x0 = Math.max(0, x - R)
      const x1 = Math.min(W, x + R + 1)
      const sum = integ[y1 * (W + 1) + x1] - integ[y0 * (W + 1) + x1] - integ[y1 * (W + 1) + x0] + integ[y0 * (W + 1) + x0]
      const mean = sum / ((y1 - y0) * (x1 - x0))
      if (mean - lum[y * W + x] > 35) density[Math.floor(y / CELL) * gw + Math.floor(x / CELL)] += 1 / (CELL * CELL)
    }
  }

  // cells with text, dilated by one cell so words join into one block
  const on = new Uint8Array(gw * gh)
  for (let i = 0; i < on.length; i++) on[i] = density[i] > 0.08 ? 1 : 0
  const dil = new Uint8Array(gw * gh)
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      dil[y * gw + x] =
        on[y * gw + x] |
        (y > 0 ? on[(y - 1) * gw + x] : 0) | (y < gh - 1 ? on[(y + 1) * gw + x] : 0) |
        (x > 0 ? on[y * gw + x - 1] : 0) | (x < gw - 1 ? on[y * gw + x + 1] : 0)
    }
  }

  // largest (by text amount) connected block
  const seen = new Uint8Array(gw * gh)
  let best = { score: 0, x0: 0, y0: 0, x1: gw - 1, y1: gh - 1, cells: 0 }
  const queue: number[] = []
  for (let start = 0; start < dil.length; start++) {
    if (!dil[start] || seen[start]) continue
    queue.length = 0
    queue.push(start)
    seen[start] = 1
    let score = 0
    let cells = 0
    let x0 = gw, y0 = gh, x1 = 0, y1 = 0
    for (let qi = 0; qi < queue.length; qi++) {
      const i = queue[qi]
      const x = i % gw
      const y = (i - x) / gw
      score += density[i]
      cells++
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
      const nbrs = [y > 0 ? i - gw : -1, y < gh - 1 ? i + gw : -1, x > 0 ? i - 1 : -1, x < gw - 1 ? i + 1 : -1]
      for (const n of nbrs) {
        if (n >= 0 && dil[n] && !seen[n]) {
          seen[n] = 1
          queue.push(n)
        }
      }
    }
    if (score > best.score) best = { score, x0, y0, x1, y1, cells }
  }

  const total = gw * gh
  if (best.cells < total * 0.03) return FULL_CROP // nothing convincing found
  const padX = (best.x1 - best.x0 + 1) * 0.04
  const padY = (best.y1 - best.y0 + 1) * 0.04
  const x = Math.max(0, best.x0 - padX) / gw
  const y = Math.max(0, best.y0 - padY) / gh
  const w = Math.min(gw, best.x1 + 1 + padX) / gw - x
  const h = Math.min(gh, best.y1 + 1 + padY) / gh - y
  if (w * h > 0.92) return FULL_CROP
  return { x, y, w, h }
}

/** Rotate → crop → resize to ~2000px wide → grayscale → stretch contrast. This is what OCR reads. */
export function prepareForOcr(img: ImageBitmap, deg: number, crop: CropRect = FULL_CROP) {
  const rotated = renderRotated(img, deg)
  const sx = crop.x * rotated.width
  const sy = crop.y * rotated.height
  const sw = Math.max(20, crop.w * rotated.width)
  const sh = Math.max(20, crop.h * rotated.height)
  const scale = Math.min(2.5, Math.max(0.5, 2000 / sw))
  const out = canvas(sw * scale, sh * scale)
  const ctx = out.getContext('2d', { willReadFrequently: true })!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(rotated, sx, sy, sw, sh, 0, 0, out.width, out.height)

  const img2 = ctx.getImageData(0, 0, out.width, out.height)
  const d = img2.data
  const hist = new Uint32Array(256)
  const gray = new Uint8ClampedArray(d.length / 4)
  for (let i = 0; i < gray.length; i++) {
    const v = Math.round(0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2])
    gray[i] = v
    hist[v]++
  }
  // 2% / 98% percentiles → full range
  const total = gray.length
  let acc = 0
  let lo = 0
  let hi = 255
  for (let v = 0; v < 256; v++) {
    acc += hist[v]
    if (acc >= total * 0.02) { lo = v; break }
  }
  acc = 0
  for (let v = 255; v >= 0; v--) {
    acc += hist[v]
    if (acc >= total * 0.02) { hi = v; break }
  }
  const range = Math.max(1, hi - lo)
  for (let i = 0; i < gray.length; i++) {
    const v = ((gray[i] - lo) * 255) / range
    d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v
  }
  ctx.putImageData(img2, 0, 0)
  return out
}

const filled = (p: ParsedId) =>
  [p.firstName || p.lastName, p.birthDate, p.idNumber, p.address].filter(Boolean).length

function mergeParsed(primary: ParsedId, secondary: ParsedId): ParsedId {
  const out = { ...primary }
  for (const k of Object.keys(out) as (keyof ParsedId)[]) {
    if (!out[k] && secondary[k]) (out as Record<string, string>)[k] = secondary[k]
  }
  // names belong together — don't mix first from one read with last from the other
  if (!primary.firstName && !primary.lastName) {
    out.firstName = secondary.firstName
    out.middleName = secondary.middleName
    out.lastName = secondary.lastName
    out.suffix = secondary.suffix
  }
  return out
}

/**
 * Reads a Philippine ID in the browser. Auto-straightens unless `rotation` is given.
 * Runs a normal read, then a "sparse text" read if fields are still missing, and merges both.
 */
export async function scanId(
  file: Blob,
  opts: { rotation?: number; crop?: CropRect } = {},
  onProgress?: (p: number, label: string) => void,
): Promise<OcrResult> {
  onProgress?.(0.02, 'Preparing photo')
  const img = await loadBitmap(file)
  try {
    const rotation = opts.rotation ?? detectSkew(img)
    const crop = opts.crop ?? autoCrop(img, rotation)
    const prepared = prepareForOcr(img, rotation, crop)

    onProgress?.(0.08, 'Loading OCR engine')
    const { createWorker, PSM } = await import('tesseract.js')
    let pass = 1
    const worker = await createWorker('eng', 1, {
      logger: (m) => {
        if (m.status === 'recognizing text') onProgress?.(0.15 + (pass - 1) * 0.42 + m.progress * 0.42, `Reading ID${pass > 1 ? ' (2nd pass)' : ''}`)
      },
    })
    try {
      await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO })
      const a = await worker.recognize(prepared)
      let parsed = parseIdText(a.data.text)
      let text = a.data.text
      let confidence = a.data.confidence

      if (filled(parsed) < 4) {
        pass = 2
        await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT })
        const b = await worker.recognize(prepared)
        const parsedB = parseIdText(b.data.text)
        const bFirst = filled(parsedB) > filled(parsed) || (filled(parsedB) === filled(parsed) && b.data.confidence > a.data.confidence)
        parsed = bFirst ? mergeParsed(parsedB, parsed) : mergeParsed(parsed, parsedB)
        text = `${a.data.text}\n---\n${b.data.text}`
        confidence = Math.max(a.data.confidence, b.data.confidence)
      }
      onProgress?.(1, 'Done')
      return { text: text.trim(), parsed, confidence, rotation, crop }
    } finally {
      await worker.terminate()
    }
  } finally {
    img.close()
  }
}

/** True when both names appear somewhere in the OCR text (used by staff when reviewing). */
export function nameFoundInText(text: string, first: string, last: string) {
  const norm = (s: string) => s.toUpperCase().replace(/[^A-ZÑ]/g, '')
  const hay = norm(text)
  const f = norm(first.split(' ')[0] || '')
  const l = norm(last)
  return f.length > 1 && l.length > 1 && hay.includes(f) && hay.includes(l)
}
