import type { Fund, LedgerType, PaymentMethod, Profile, ProjectStatus, RequestStatus, Verification } from './types'

const pesoFmt = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 2 })
const pesoShort = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 })

export const peso = (n: number | string | null | undefined) => pesoFmt.format(Number(n ?? 0))
export const pesoRound = (n: number | string | null | undefined) => pesoShort.format(Number(n ?? 0))

export function fmtDate(value: string | null | undefined) {
  if (!value) return '—'
  const d = value.length === 10 ? new Date(value + 'T00:00:00') : new Date(value)
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function fmtDateTime(value: string | null | undefined) {
  if (!value) return '—'
  return new Date(value).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export function fullName(p: Pick<Profile, 'first_name' | 'last_name'> & Partial<Pick<Profile, 'middle_name' | 'suffix'>> | null | undefined) {
  if (!p) return ''
  return [p.first_name, p.middle_name, p.last_name, p.suffix].filter(Boolean).join(' ').trim()
}

export function initialsOf(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?'
}

export function ageFrom(iso: string | null | undefined) {
  if (!iso) return null
  const [y, m, d] = iso.split('-').map(Number)
  const today = new Date()
  let age = today.getFullYear() - y
  if (today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d)) age--
  return age
}

type Tone = 'gray' | 'blue' | 'amber' | 'green' | 'red' | 'violet'

export const requestStatusMeta: Record<RequestStatus, { label: string; tone: Tone }> = {
  pending: { label: 'Submitted', tone: 'gray' },
  under_review: { label: 'Under review', tone: 'blue' },
  approved: { label: 'Approved', tone: 'violet' },
  ready: { label: 'Ready for pickup', tone: 'green' },
  released: { label: 'Released', tone: 'green' },
  rejected: { label: 'Rejected', tone: 'red' },
  cancelled: { label: 'Cancelled', tone: 'gray' },
}

export const verificationMeta: Record<Verification, { label: string; tone: Tone }> = {
  unverified: { label: 'Not submitted', tone: 'gray' },
  pending: { label: 'Pending review', tone: 'amber' },
  verified: { label: 'Verified', tone: 'green' },
  rejected: { label: 'Needs resubmission', tone: 'red' },
}

export const projectStatusMeta: Record<ProjectStatus, { label: string; tone: Tone }> = {
  proposed: { label: 'Proposed', tone: 'amber' },
  ongoing: { label: 'Ongoing', tone: 'blue' },
  completed: { label: 'Completed', tone: 'green' },
}

export const fundLabel: Record<Fund, string> = {
  general: 'General Fund',
  development: '20% Development Fund',
  digital_revenue: 'Digital Collections',
}

export const ledgerTypeLabel: Record<LedgerType, string> = {
  allocation: 'Allocation',
  collection: 'Collection',
  disbursement: 'Disbursement',
  project_update: 'Project update',
  adjustment: 'Adjustment',
}

export const methodLabel: Record<PaymentMethod, string> = {
  gcash: 'GCash',
  maya: 'Maya',
  qrph: 'QR Ph',
  card: 'Debit / Credit card',
  cash: 'Cash',
}

export const PUROKS = [
  'Purok 1 (Centrong Bayan)',
  'Purok 2 (Tabing-Ilog)',
  'Purok 3 (Gulod)',
  'Purok 4 (Bustos Dam Road)',
  'Purok 5 (San Isidro)',
  'Purok 6 (Kabyawan)',
  'Sitio Dulo',
]

export const ID_TYPES = [
  'Philippine National ID (PhilSys)',
  "COMELEC Voter's ID / Certificate",
  'UMID',
  "Driver's License (LTO)",
  'Postal ID',
  'Student ID (ages 15–17)',
  'Senior Citizen ID',
  'Philippine Passport',
]

export const CIVIL_STATUSES = ['Single', 'Married', 'Widowed', 'Separated']

/** Readable message from a Supabase / JS error */
export function errMsg(e: unknown): string {
  if (!e) return 'Something went wrong.'
  if (typeof e === 'string') return e
  if (e instanceof Error) return e.message
  if (typeof e === 'object' && e && 'message' in e) return String((e as { message: unknown }).message)
  return 'Something went wrong.'
}
