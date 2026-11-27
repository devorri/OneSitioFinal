import { Link } from 'react-router-dom'
import { usePageTitle } from '../usePageTitle'

export default function NotFound() {
  usePageTitle('Not found • OneSitio')
  return (
    <div className="container py-5 text-center" style={{ maxWidth: 520 }}>
      <div className="eyebrow">404</div>
      <h1 className="h3 mt-2">Hindi nahanap ang pahina</h1>
      <p className="text-muted">The page you’re looking for doesn’t exist.</p>
      <Link to="/" className="btn btn-ink">Back to home</Link>
    </div>
  )
}
