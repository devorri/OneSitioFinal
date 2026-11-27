import { useState } from 'react'
import { usePageTitle } from '../usePageTitle'

export default function Counter() {
  usePageTitle('Counter')
  const [currentCount, setCurrentCount] = useState(0)

  return (
    <>
      <h1>Counter</h1>
      <p role="status">Current count: {currentCount}</p>
      <button className="btn btn-primary" onClick={() => setCurrentCount((c) => c + 1)}>
        Click me
      </button>
    </>
  )
}
