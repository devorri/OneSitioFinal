import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../supabaseClient'
import type { Profile } from '../lib/types'
import { AuthContext } from './context'

async function fetchProfile(userId: string): Promise<Profile | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
    if (data) return data as Profile
    // profile row is created by a database trigger right after sign-up
    await new Promise((r) => setTimeout(r, 600))
  }
  return null
}

export default function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [sessionReady, setSessionReady] = useState(false)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [profileFor, setProfileFor] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setSessionReady(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      setSessionReady(true)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const userId = session?.user.id ?? null

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    fetchProfile(userId).then((p) => {
      if (cancelled) return
      setProfile(p)
      setProfileFor(userId)
    })
    return () => {
      cancelled = true
    }
  }, [userId])

  const refreshProfile = useCallback(async () => {
    if (!userId) return
    const p = await fetchProfile(userId)
    setProfile(p)
    setProfileFor(userId)
  }, [userId])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setProfile(null)
    setProfileFor(null)
  }, [])

  const currentProfile = userId && profileFor === userId ? profile : null
  const loading = !sessionReady || (!!userId && profileFor !== userId)

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      profile: currentProfile,
      loading,
      isStaff: !!currentProfile && currentProfile.role !== 'resident',
      refreshProfile,
      signOut,
    }),
    [session, currentProfile, loading, refreshProfile, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
