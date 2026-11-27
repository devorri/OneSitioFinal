export type Role = 'resident' | 'secretary' | 'treasurer' | 'captain' | 'admin'
export type Verification = 'unverified' | 'pending' | 'verified' | 'rejected'
export type RequestStatus = 'pending' | 'under_review' | 'approved' | 'ready' | 'released' | 'rejected' | 'cancelled'
export type PaymentStatus = 'unpaid' | 'paid' | 'waived'
export type PaymentMethod = 'gcash' | 'maya' | 'qrph' | 'card' | 'cash'
export type ProjectStatus = 'proposed' | 'ongoing' | 'completed'
export type LedgerType = 'allocation' | 'collection' | 'disbursement' | 'project_update' | 'adjustment'
export type Fund = 'general' | 'development' | 'digital_revenue'

export interface Profile {
  id: string
  resident_code: string | null
  email: string | null
  first_name: string
  middle_name: string | null
  last_name: string
  suffix: string | null
  birth_date: string | null
  civil_status: string | null
  mobile: string | null
  purok: string | null
  street_address: string | null
  is_household_head: boolean
  role: Role
  verification_status: Verification
  id_type: string | null
  id_number: string | null
  id_image_path: string | null
  selfie_path: string | null
  ocr_text: string | null
  verification_note: string | null
  verified_at: string | null
  created_at: string
  updated_at: string
}

export interface HouseholdMember {
  id: string
  head_id: string
  full_name: string
  relationship: string
  birth_date: string | null
  created_at: string
}

export interface DocumentType {
  code: string
  name: string
  description: string | null
  fee: number
  processing_time: string | null
  requirements: string[]
  active: boolean
  sort_order: number
}

export interface DocumentRequest {
  id: string
  reference_code: string
  requester_id: string
  household_member_id: string | null
  beneficiary_name: string
  document_type: string
  purpose: string
  fee: number
  status: RequestStatus
  payment_status: PaymentStatus
  staff_note: string | null
  created_at: string
  updated_at: string
  released_at: string | null
  document_types?: { name: string } | null
  profiles?: Pick<Profile, 'first_name' | 'last_name' | 'resident_code' | 'email' | 'mobile' | 'purok'> | null
}

export interface RequestEvent {
  id: number
  request_id: string
  status: RequestStatus
  note: string | null
  actor_id: string | null
  created_at: string
}

export interface Payment {
  id: string
  request_id: string
  payer_id: string
  amount: number
  method: PaymentMethod
  reference_no: string
  created_at: string
}

export interface Project {
  id: string
  title: string
  location: string | null
  description: string | null
  budget: number
  contractor: string | null
  status: ProjectStatus
  progress: number
  image_url: string | null
  start_date: string | null
  end_date: string | null
  created_at: string
  updated_at: string
}

export interface LedgerBlock {
  block_number: number
  prev_hash: string
  hash: string
  payload: string
  entry_type: LedgerType
  fund: Fund
  title: string
  description: string | null
  amount: number
  reference: string | null
  project_id: string | null
  created_at: string
}

export interface FundSummary {
  fund: Fund
  allocated: number
  collected: number
  disbursed: number
  balance: number
  entries: number
}

export interface TrackResult {
  reference_code: string
  document_name: string
  beneficiary: string
  status: RequestStatus
  payment_status: PaymentStatus
  created_at: string
  updated_at: string
}
