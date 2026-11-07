import { useMemo, useState } from 'react'
import { solarPosition } from './engine/solarPosition'

/** Converte "AAAA-MM-GGTHH:MM" interpretandolo come ora UTC. */
function parseUtc(value: string): Date {
  return new Date(`${value}:00Z`)
}

function nowUtcInputValue(): string {
  return new Date().toISOString().slice(0, 16)
}

const fmt = (x: number, digits = 2) => x.toLocaleString('it-IT', { maximumFractionDigits: digits, minimumFractionDigits: digits })

export default function App() {
  const [latitude, setLatitude] = useState(41.9028) // Roma
  const [longitude, setLongitude] = useState(12.4964)
  const [dateTime, setDateTime] = useState(nowUtcInputValue)

  const result = useMemo(() => {
    try {
      return { ok: true as const, p: solarPosition(parseUtc(dateTime), latitude, longitude) }
    } catch (err) {
      return { ok: false as const, message: (err as Error).message }
    }
  }, [dateTime, latitude, longitude])

  return (
    <main>
      <h1>Irradia</h1>
      <p className="subtitle">Posizione del sole — primo modulo del motore di calcolo</p>

      <section className="inputs">
        <label>
          Latitudine (°, Nord positiva)
          <input type="number" step="0.0001" value={latitude} onChange={(e) => setLatitude(e.target.valueAsNumber)} />
        </label>
        <label>
          Longitudine (°, Est positiva)
          <input type="number" step="0.0001" value={longitude} onChange={(e) => setLongitude(e.target.valueAsNumber)} />
        </label>
        <label>
          Data e ora (UTC)
          <input type="datetime-local" value={dateTime} onChange={(e) => setDateTime(e.target.value)} />
        </label>
      </section>

      {result.ok ? (
        <table>
          <tbody>
            <tr><th>Elevazione apparente</th><td>{fmt(result.p.apparentElevation)}°</td></tr>
            <tr><th>Elevazione geometrica</th><td>{fmt(result.p.elevation)}°</td></tr>
            <tr><th>Azimut (da Nord, orario)</th><td>{fmt(result.p.azimuth)}°</td></tr>
            <tr><th>Declinazione</th><td>{fmt(result.p.declination)}°</td></tr>
            <tr><th>Equazione del tempo</th><td>{fmt(result.p.equationOfTime)} min</td></tr>
            <tr><th>Angolo orario</th><td>{fmt(result.p.hourAngle)}°</td></tr>
          </tbody>
        </table>
      ) : (
        <p className="error">Input non valido: {result.message}</p>
      )}
    </main>
  )
}
