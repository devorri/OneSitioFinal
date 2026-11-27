// Turns raw OCR text from a Philippine ID into form fields.
// Works with bilingual PhilSys labels (Pangalan / Name, Petsa ng Kapanganakan / Date of Birth, Tirahan / Address),
// UMID / Postal / Passport style (Last Name, First Name, Middle Name) and LTO style ("DELA CRUZ, JUAN SANTOS").
// OCR is noisy, so everything here is best-effort — the user always reviews the result.

export interface ParsedId {
  firstName: string
  middleName: string
  lastName: string
  suffix: string
  birthDate: string // YYYY-MM-DD
  address: string
  idNumber: string
  sex: '' | 'Male' | 'Female'
}

const MONTHS: Record<string, number> = {
  JAN: 1, JANUARY: 1, ENERO: 1,
  FEB: 2, FEBRUARY: 2, PEBRERO: 2,
  MAR: 3, MARCH: 3, MARSO: 3,
  APR: 4, APRIL: 4, ABRIL: 4,
  MAY: 5, MAYO: 5,
  JUN: 6, JUNE: 6, HUNYO: 6,
  JUL: 7, JULY: 7, HULYO: 7,
  AUG: 8, AUGUST: 8, AGOSTO: 8,
  SEP: 9, SEPT: 9, SEPTEMBER: 9, SETYEMBRE: 9,
  OCT: 10, OCTOBER: 10, OKTUBRE: 10,
  NOV: 11, NOVEMBER: 11, NOBYEMBRE: 11,
  DEC: 12, DECEMBER: 12, DISYEMBRE: 12,
}
const MONTH_RE = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|')

const LABELS = {
  last: /\b(APELYIDO|LAST\s*NAME|SURNAME)\b/i,
  given: /\b(MGA\s*PANGALAN|GIVEN\s*NAMES?|FIRST\s*NAME)\b/i,
  middle: /\b(GITNANG\s*APELYIDO|MIDDLE\s*NAME)\b/i,
  fullName: /\b(PANGALAN|NAME)\b/i,
  dob: /\b(KAPANGANAKAN|DATE\s*OF\s*BIRTH|BIRTH\s*DATE|BIRTHDAY|DOB)\b/i,
  address: /\b(TIRAHAN|ADDRESS)\b/i,
  sex: /\b(KASARIAN|SEX)\b/i,
  idNo: /\b(ID\s*(NUMBER|NO)|PCN|CRN|PRN|LICENSE\s*NO|PASSPORT\s*NO)\b/i,
}
// every label phrase (stripped out of values, e.g. "Mga Pangalan/Given Names")
const LABEL_WORDS = /\b(GITNANG\s*APELYIDO|APELYIDO|LAST\s*NAMES?|FIRST\s*NAMES?|MIDDLE\s*NAMES?|GIVEN\s*NAMES?|SURNAME|MGA\s*PANGALAN|PANGALAN|NAMES?|PETSA\s*NG\s*KAPANGANAKAN|KAPANGANAKAN|DATE\s*OF\s*BIRTH|BIRTH\s*DATE|TIRAHAN|ADDRESS|KASARIAN|SEX|NATIONALITY|CITIZENSHIP)\b/gi
// a line that starts a new field
const ANY_LABEL = /\b(APELYIDO|LAST\s*NAME|SURNAME|PANGALAN|NAMES?|KAPANGANAKAN|DATE\s*OF|BIRTH|TIRAHAN|ADDRESS|KASARIAN|SEX|CITIZENSHIP|NATIONALITY|BLOOD|HEIGHT|WEIGHT|EXP|EXPIRY|EXPIRATION|VALID|ISSUE|SIGNATURE|LAGDA|PRN|PCN|CRN|[1I]D\s*(NUMBER|NO)|LICENSE\s*NO)\b/i
const NOISE_LINE = /(REPUBLI[CK]|PILIPINAS|PHILIPPINES|PAGKAKAKILANLAN|IDENTIFICATION|SPECIMEN|MULTI-PURPOSE|GOVERNMENT|DEPARTMENT|LAND TRANSPORTATION|OFFICE|IDENTITY CARD)/i
const ADDRESS_ABBR = new Set(['ST', 'RD', 'NO', 'DR', 'AVE', 'BLK', 'LOT', 'PH'])
const SUFFIXES = new Set(['JR', 'JR.', 'SR', 'SR.', 'II', 'III', 'IV', 'V'])
const PARTICLES = new Set(['DE', 'DEL', 'DELA', 'DELOS', 'DELAS', 'LOS', 'LAS', 'LA', 'SAN', 'STA', 'STA.', 'STO', 'STO.', 'SANTA', 'SANTO', 'DI', 'VAN', 'VON', 'MC'])

/** Fixes common OCR slips: 0 read as O in month names, l/I in digits, extra spaces in numbers. */
// Case is kept on purpose: real ID text is uppercase, OCR junk is usually lowercase.
function normalize(raw: string) {
  return raw
    .replace(/[“”"«»|_~©®]/g, ' ')
    .replace(/(\d)\s*0CT\b/g, '$1 OCT')
    .replace(/\b0CT\b/g, 'OCT')
    .replace(/\bN0V\b/g, 'NOV')
    .replace(/[ \t]+/g, ' ')
}

/** Keeps only plausible name tokens: uppercase words, initials, hyphens, apostrophes. */
function cleanName(s: string) {
  return s
    .replace(LABEL_WORDS, ' ')
    .replace(/[^A-ZÑ.,' -]/g, ' ')
    .split(/\s+/)
    .filter((t) => /^[A-ZÑ][A-ZÑ'.-]*$/.test(t) && (t.replace(/\./g, '').length >= 2 || /^[A-Z]\.$/.test(t)))
    .join(' ')
    .trim()
}

function cleanAddressLine(line: string) {
  const tokens = line
    .replace(LABEL_WORDS, ' ')
    .replace(/[^A-Za-z0-9Ññ.,#'\-/ ]/g, ' ')
    .split(/\s+/)
    .filter((t) => {
      const core = t.replace(/[.,]/g, '')
      if (!core || /^[-/#']+$/.test(core)) return false
      if (/\d/.test(core)) return true
      if (/^[A-ZÑ'-]{2,}$/.test(core)) return core.length > 2 || ADDRESS_ABBR.has(core)
      return /^[A-ZÑ][a-zñ]{2,}$/.test(core) // "Brgy", "Purok"
    })
  return tokens.join(' ')
}

// provinces / regions — anything after the last one is usually OCR junk (QR codes, holograms)
const PROVINCES = /\b(BULACAN|PAMPANGA|METRO MANILA|NCR|RIZAL|CAVITE|LAGUNA|BATANGAS|NUEVA ECIJA|TARLAC|ZAMBALES|BATAAN|PANGASINAN|QUEZON|AURORA|CEBU|DAVAO(?: DEL (?:SUR|NORTE))?|ILOILO|NEGROS (?:OCCIDENTAL|ORIENTAL)|LEYTE|ALBAY|CAMARINES (?:SUR|NORTE)|BENGUET|ILOCOS (?:NORTE|SUR)|LA UNION|ISABELA|CAGAYAN|PALAWAN|BOHOL|MISAMIS (?:ORIENTAL|OCCIDENTAL))\b/gi

function cleanAddress(parts: string[]) {
  let joined = parts
    .map(cleanAddressLine)
    .filter(Boolean)
    .join(', ')
    .replace(/\s+,/g, ',')
    .replace(/,(\s*,)+/g, ',')
  const hits = [...joined.matchAll(PROVINCES)]
  const last = hits[hits.length - 1]
  if (last && last.index !== undefined) joined = joined.slice(0, last.index + last[0].length)
  return joined.replace(/^[,\s]+|[,\s]+$/g, '').trim()
}

/** Lines holding the value after a label: the rest of the same line, then the next non-label line(s). */
function partsAfter(lines: string[], re: RegExp, opts: { take?: number; exclude?: RegExp; stop?: RegExp } = {}) {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const m = line.match(re)
    if (!m || (opts.exclude && opts.exclude.test(line))) continue
    const out: string[] = []
    // rest of the label line, minus any other label text ("Mga Pangalan/Given Names", "DATE OF BIRTH: SEX:")
    const rest = line.slice((m.index ?? 0) + m[0].length).replace(LABEL_WORDS, ' ').replace(/^[\s:/.-]+/, '')
    if (/[A-Za-z0-9]{2,}/.test(rest)) out.push(rest.trim())
    const take = opts.take ?? 1
    for (let j = i + 1; j < lines.length && out.length < take; j++) {
      const next = lines[j].trim()
      if (!next) continue
      if (ANY_LABEL.test(next) && !/\d{4}/.test(next)) break
      if (opts.stop && opts.stop.test(next)) break
      out.push(next)
    }
    if (out.length) return out
  }
  return []
}

const valueAfter = (lines: string[], re: RegExp, opts: { take?: number; exclude?: RegExp } = {}) =>
  partsAfter(lines, re, opts).join(' ')

function toIsoDate(y: number, m: number, d: number) {
  const date = new Date(y, m - 1, d)
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return ''
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** All dates found in a string, as ISO strings. */
export function findDates(s: string): string[] {
  const out: string[] = []
  const t = s.replace(/[,.]/g, ' ')
  let m: RegExpExecArray | null
  const reDMY = new RegExp(`\\b(\\d{1,2})\\s*(${MONTH_RE})\\s*(\\d{4})\\b`, 'g')
  while ((m = reDMY.exec(t))) out.push(toIsoDate(+m[3], MONTHS[m[2]], +m[1]))
  const reMDY = new RegExp(`\\b(${MONTH_RE})\\s*(\\d{1,2})\\s+(\\d{4})\\b`, 'g')
  while ((m = reMDY.exec(t))) out.push(toIsoDate(+m[3], MONTHS[m[1]], +m[2]))
  const reYMD = /\b(19\d{2}|20\d{2})[/-](\d{1,2})[/-](\d{1,2})\b/g
  while ((m = reYMD.exec(t))) out.push(toIsoDate(+m[1], +m[2], +m[3]))
  const reNum = /\b(\d{1,2})[/-](\d{1,2})[/-](19\d{2}|20\d{2})\b/g // PH uses MM/DD/YYYY
  while ((m = reNum.exec(t))) out.push(toIsoDate(+m[3], +m[1], +m[2]) || toIsoDate(+m[3], +m[2], +m[1]))
  return out.filter(Boolean)
}

function plausibleBirth(iso: string) {
  const y = +iso.slice(0, 4)
  return y >= 1900 && y <= new Date().getFullYear() - 1
}

/** "MARIA CLARA SANTOS DELA CRUZ JR" → first / middle / last / suffix (Filipino order: given, middle, last). */
export function splitFullName(full: string) {
  let tokens = full.toUpperCase().split(/\s+/).filter(Boolean)
  let suffix = ''
  if (tokens.length > 1 && SUFFIXES.has(tokens[tokens.length - 1])) suffix = tokens.pop()!.replace('.', '')
  if (tokens.length === 0) return { first: '', middle: '', last: '', suffix }
  if (tokens.length === 1) return { first: tokens[0], middle: '', last: '', suffix }

  // last name = final token plus any particles before it ("DELA CRUZ", "DE LOS SANTOS")
  let start = tokens.length - 1
  while (start - 1 > 0 && PARTICLES.has(tokens[start - 1])) start--
  const last = tokens.slice(start).join(' ')
  tokens = tokens.slice(0, start)

  let middle = ''
  if (tokens.length >= 3 || (tokens.length === 2 && /^[A-Z]\.?$/.test(tokens[1]))) {
    // middle name may also have particles ("DE GUZMAN")
    let mStart = tokens.length - 1
    while (mStart - 1 > 0 && PARTICLES.has(tokens[mStart - 1])) mStart--
    middle = tokens.slice(mStart).join(' ')
    tokens = tokens.slice(0, mStart)
  }
  return { first: tokens.join(' '), middle, last, suffix }
}

/** "JUAN SANTOS" (given + middle, as on LTO licenses) → first JUAN, middle SANTOS */
export function splitGivenMiddle(s: string) {
  const tokens = s.toUpperCase().split(/\s+/).filter(Boolean)
  let suffix = ''
  if (tokens.length > 1 && SUFFIXES.has(tokens[tokens.length - 1])) suffix = tokens.pop()!.replace('.', '')
  if (tokens.length < 2) return { first: tokens.join(' '), middle: '', suffix }
  let mStart = tokens.length - 1
  while (mStart - 1 > 0 && PARTICLES.has(tokens[mStart - 1])) mStart--
  return { first: tokens.slice(0, mStart).join(' '), middle: tokens.slice(mStart).join(' '), suffix }
}

export function extractIdNumber(text: string): string {
  const t = text.toUpperCase()
  // collapse stray spaces inside dashed number groups: "8942-501 8-9120" → "8942-5018-9120"
  const candidates = (t.match(/\d[\d -]{7,24}\d/g) ?? []).map((c) => c.replace(/\s+/g, ''))
  const patterns = [
    /^\d{4}-\d{4}-\d{4}-\d{4}$/, // PhilSys PCN
    /^\d{4}-\d{4}-\d{4}$/,
    /^\d{4}-\d{7}-\d$/, // UMID CRN
    /^\d{2}-\d{7}-\d$/, // SSS
  ]
  for (const re of patterns) {
    const hit = candidates.find((c) => re.test(c))
    if (hit) return hit
  }
  const lto = text.match(/\b[A-Z]\d{2}[- ]?\d{2}[- ]?\d{6}\b/) // LTO license (uppercase only)
  if (lto) return lto[0].replace(/\s+/g, '-')
  const passport = text.match(/\b[A-Z]{1,2}\d{7}[A-Z]?\b/)
  if (passport) return passport[0]
  const labeled = valueAfter(text.split('\n'), LABELS.idNo).toUpperCase().match(/[A-Z0-9-]{6,}/)
  if (labeled) return labeled[0]
  const plain = candidates.find((c) => /^\d{9,16}$/.test(c.replace(/-/g, '')) && !/^(19|20)\d{2}$/.test(c))
  return plain ?? ''
}

export const titleCase = (s: string) =>
  s.toLowerCase().replace(/(^|[\s\-'.])([a-zñ])/g, (_, p: string, c: string) => p + c.toUpperCase())

export function parseIdText(raw: string): ParsedId {
  const text = normalize(raw)
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  const content = lines.filter((l) => !NOISE_LINE.test(l))

  // ---- names ----
  let last = cleanName(valueAfter(content, LABELS.last, { exclude: LABELS.middle }))
  let first = cleanName(valueAfter(content, LABELS.given))
  let middle = cleanName(valueAfter(content, LABELS.middle))
  let suffix = ''

  // LTO style: "LAST NAME, FIRST NAME, MIDDLE NAME" header + "DELA CRUZ, JUAN SANTOS"
  const ltoHeader = content.findIndex((l) => /LAST\s*NAME\s*,\s*FIRST/i.test(l))
  if (ltoHeader >= 0) {
    const valueLine = content.slice(ltoHeader + 1).find((l) => l.includes(','))
    if (valueLine) {
      const [l, rest = ''] = valueLine.split(',', 2)
      last = cleanName(l)
      const parts = splitGivenMiddle(cleanName(rest))
      first = parts.first
      middle = parts.middle
      suffix = parts.suffix
    }
  }

  if (!first && !last) {
    // single "Pangalan / Name" field holding the full name
    const full = cleanName(valueAfter(content, LABELS.fullName, { exclude: /APELYIDO|LAST|FIRST|MIDDLE|GIVEN|SURNAME/i }))
    if (full) {
      const parts = splitFullName(full)
      first = parts.first
      middle = parts.middle
      last = parts.last
      suffix = parts.suffix
    }
  } else if (first) {
    const tail = first.split(' ').pop() ?? ''
    if (SUFFIXES.has(tail) && first.includes(' ')) {
      suffix = tail.replace('.', '')
      first = first.slice(0, -tail.length).trim()
    }
  }

  // ---- birth date ----
  let birthDate: string
  const dobValue = valueAfter(content, LABELS.dob, { take: 2 }).toUpperCase()
  const labeled = findDates(dobValue).filter(plausibleBirth)
  if (labeled.length) birthDate = labeled[0]
  else {
    // no label found: oldest plausible date that isn't next to "expiry/issued"
    const dates = content
      .filter((l) => !/(EXP|VALID|ISSUE|ISSUED)/i.test(l))
      .flatMap((l) => findDates(l.toUpperCase()))
      .filter(plausibleBirth)
      .sort()
    birthDate = dates[0] ?? ''
  }

  // ---- sex ----
  const sexLine = (valueAfter(content, LABELS.sex) + ' ' + content.join(' ')).toUpperCase()
  const sex: ParsedId['sex'] = /\bFEMALE\b|\bBABAE\b/.test(sexLine) ? 'Female' : /\bMALE\b|\bLALAKI\b/.test(sexLine) ? 'Male' : ''

  // ---- address ----
  const address = cleanAddress(
    partsAfter(content, LABELS.address, {
      take: 3,
      stop: /^\W*\d[\d\s-]{7,}\d\W*$|\d{4}-\d{3,4}-\d|\b(PRN|PCN|CRN|[1I]D\s*(NUMBER|NO)|LICENSE\s*NO|EXP)/i,
    }).map(
      (l) => l.split(/\b(CITIZENSHIP|FILIPINO|SAMPLE|SPECIMEN)\b/i)[0],
    ),
  )

  return {
    firstName: titleCase(first),
    middleName: titleCase(middle),
    lastName: titleCase(last),
    suffix: suffix ? titleCase(suffix) : '',
    birthDate,
    address: titleCase(address),
    idNumber: extractIdNumber(text),
    sex,
  }
}

/** Maps an ID address onto the registration form (purok dropdown + street), and checks it's in Talampas. */
export function addressToForm(address: string, puroks: string[]) {
  const up = address.toUpperCase()
  let purok = ''
  const n = up.match(/\bPUROK\s*(\d)\b/)
  if (n) purok = puroks.find((p) => p.toUpperCase().startsWith(`PUROK ${n[1]}`)) ?? ''
  else if (/\bSITIO\s+DULO\b/.test(up)) purok = puroks.find((p) => /dulo/i.test(p)) ?? ''

  const cut = address.search(/\b(PUROK|SITIO|BRGY|BARANGAY|TALAMPAS|BUSTOS)\b/i)
  const street = (cut === -1 ? '' : address.slice(0, cut)).replace(/[\s,]+$/, '').trim()

  return { purok, street, inTalampas: /\bTALAMPAS\b/.test(up) }
}
