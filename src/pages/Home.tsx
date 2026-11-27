import { usePageTitle } from '../usePageTitle'

export default function Home() {
  usePageTitle('Home')
  return (
    <>
      <h1>Hello, world!</h1>
      Welcome to your new app.
    </>
  )
}
