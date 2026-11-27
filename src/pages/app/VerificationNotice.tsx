import { Link } from 'react-router-dom'
import type { Profile } from '../../lib/types'

export default function VerificationNotice({ profile }: { profile: Profile | null }) {
  if (!profile || profile.verification_status === 'verified') return null

  if (profile.verification_status === 'pending') {
    return (
      <div className="note note-warn mb-4">
        <i className="bi bi-hourglass-split"></i>
        <span>Your ID is being reviewed by the Barangay Secretary. You can request documents once you’re verified.</span>
      </div>
    )
  }

  if (profile.verification_status === 'rejected') {
    return (
      <div className="note note-bad mb-4">
        <i className="bi bi-exclamation-circle"></i>
        <div className="flex-grow-1">
          <div className="fw-medium">Your ID needs to be resubmitted.</div>
          {profile.verification_note && <div>Reason: {profile.verification_note}</div>}
        </div>
        <Link to="/app/profile" className="btn btn-line btn-sm">Resubmit</Link>
      </div>
    )
  }

  return (
    <div className="note mb-4">
      <i className="bi bi-person-badge"></i>
      <span className="flex-grow-1">Verify your account by uploading a valid ID and a selfie. This is required before requesting documents.</span>
      <Link to="/app/profile" className="btn btn-ink btn-sm">Upload ID</Link>
    </div>
  )
}
