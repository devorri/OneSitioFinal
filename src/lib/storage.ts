import { supabase } from '../supabaseClient'

export async function uploadResidentFile(userId: string, kind: 'id' | 'selfie', file: Blob, ext: string) {
  const path = `${userId}/${kind}-${Date.now()}.${ext}`
  const { error } = await supabase.storage.from('resident-docs').upload(path, file, {
    upsert: true,
    contentType: file.type || (ext === 'pdf' ? 'application/pdf' : 'image/jpeg'),
  })
  if (error) throw error
  return path
}

export async function signedUrl(path: string | null | undefined, seconds = 600) {
  if (!path) return null
  const { data, error } = await supabase.storage.from('resident-docs').createSignedUrl(path, seconds)
  if (error) return null
  return data.signedUrl
}

export function extOf(file: File) {
  const fromName = file.name.split('.').pop()?.toLowerCase()
  if (fromName && fromName.length <= 4) return fromName
  if (file.type === 'application/pdf') return 'pdf'
  if (file.type === 'image/png') return 'png'
  return 'jpg'
}
