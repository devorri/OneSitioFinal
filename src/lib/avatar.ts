import { supabase } from '../supabaseClient'

/** Center-crops to a square and shrinks to `size` px JPEG so avatars stay small. */
export async function squareResize(file: Blob, size = 320): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const side = Math.min(bitmap.width, bitmap.height)
  const sx = (bitmap.width - side) / 2
  const sy = (bitmap.height - side) / 2
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas not supported')
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, size, size)
  bitmap.close()
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not process image'))), 'image/jpeg', 0.88),
  )
}

export async function uploadAvatar(userId: string, file: File) {
  if (!file.type.startsWith('image/')) throw new Error('Please choose an image file.')
  if (file.size > 10 * 1024 * 1024) throw new Error('Image is too large (max 10 MB).')
  const blob = await squareResize(file)
  const path = `${userId}/avatar-${Date.now()}.jpg`
  const { error } = await supabase.storage.from('avatars').upload(path, blob, { contentType: 'image/jpeg', upsert: true })
  if (error) throw error
  return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl
}

/** Removes an uploaded avatar file (ignored for Google/Facebook photo URLs). */
export async function deleteAvatarFile(url: string | null | undefined) {
  if (!url) return
  const marker = '/storage/v1/object/public/avatars/'
  const i = url.indexOf(marker)
  if (i === -1) return
  await supabase.storage.from('avatars').remove([decodeURIComponent(url.slice(i + marker.length))])
}
