import { usePageTitle } from '../usePageTitle'

export default function NotFound() {
  usePageTitle('Not found')
  return (
    <>
      <h1>Not found</h1>
      <p>Sorry, there's nothing at this address.</p>
    </>
  )
}
