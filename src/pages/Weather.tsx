import { useEffect, useState } from 'react'
import { usePageTitle } from '../usePageTitle'

interface WeatherForecast {
  date: Date
  temperatureC: number
  summary: string
}

const summaries = ['Freezing', 'Bracing', 'Chilly', 'Cool', 'Mild', 'Warm', 'Balmy', 'Hot', 'Sweltering', 'Scorching']
const toF = (c: number) => 32 + Math.trunc(c / 0.5556)
const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min)) + min

export default function Weather() {
  usePageTitle('Weather')
  const [forecasts, setForecasts] = useState<WeatherForecast[] | null>(null)

  useEffect(() => {
    // Simulate async loading like the Blazor StreamRendering demo
    const t = setTimeout(() => {
      const start = new Date()
      setForecasts(
        Array.from({ length: 5 }, (_, i) => {
          const d = new Date(start)
          d.setDate(start.getDate() + i + 1)
          return { date: d, temperatureC: rand(-20, 55), summary: summaries[rand(0, summaries.length)] }
        }),
      )
    }, 500)
    return () => clearTimeout(t)
  }, [])

  return (
    <>
      <h1>Weather</h1>
      <p>This component demonstrates showing data.</p>

      {forecasts === null ? (
        <p><em>Loading...</em></p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Temp. (C)</th>
              <th>Temp. (F)</th>
              <th>Summary</th>
            </tr>
          </thead>
          <tbody>
            {forecasts.map((f) => (
              <tr key={f.date.toISOString()}>
                <td>{f.date.toLocaleDateString()}</td>
                <td>{f.temperatureC}</td>
                <td>{toF(f.temperatureC)}</td>
                <td>{f.summary}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}
