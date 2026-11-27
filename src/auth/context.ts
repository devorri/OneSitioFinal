import { createContext, useContext } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import type { Profile } from '../lib/types'

export interface AuthState {
  session: Session | null
  user: User | null
  profile: Profile | null
  loading: boolean
  isStaff: boolean
  refreshProfile: () => Promise<void>
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthState | null>(null)

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

/** Google/Facebook accounts start without address/birthday — they finish it on the profile page. */
export function profileIncomplete(p: Profile | null) {
  return !p || !p.first_name || !p.last_name || !p.birth_date || !p.purok
}
