import { useState } from 'react'
import { initialsOf } from '../lib/format'

/** Profile photo with an initials fallback. */
export default function Avatar({ url, name, size = 36 }: { url?: string | null; name: string; size?: number }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const style = { width: size, height: size, fontSize: Math.max(11, size * 0.36) }

  if (url && failedUrl !== url) {
    return (
      <img
        src={url}
        alt=""
        className="avatar avatar-img"
        style={style}
        referrerPolicy="no-referrer"
        onError={() => setFailedUrl(url)}
      />
    )
  }
  return (
    <span className="avatar" style={style} aria-hidden="true">
      {initialsOf(name)}
    </span>
  )
}
