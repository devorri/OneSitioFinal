import { supabase } from '../supabaseClient'

export type OAuthProvider = 'google' | 'facebook'

export async function signInWithProvider(provider: OAuthProvider) {
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: `${window.location.origin}/auth/callback` },
  })
  if (error) throw error
}
