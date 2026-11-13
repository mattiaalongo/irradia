/**
 * Grafico a barre dell'energia prodotta nei 12 mesi, in SVG.
 *
 * Disegnato a mano (niente librerie di grafici): sono 12 barre, e così controlliamo
 * testi in italiano, colori del tema chiaro/scuro e accessibilità senza dipendenze.
 * Regole grafiche: barre sottili (≤ 24 px) con estremità arrotondata e base squadrata,
 * griglia leggera, valori scritti solo sul mese massimo e minimo; il valore di ogni mese
 * compare passando sopra la barra (o con il tasto Tab) e nella tabella sotto il grafico.
 */

import { useState } from 'react'
import { niceScale } from './chartScale'
import { MONTH_ABBR, MONTH_NAMES, formatNumber } from './format'

/** Dimensioni del disegno in unità SVG; l'SVG poi si adatta alla larghezza della pagina. */
const WIDTH = 640
const HEIGHT = 280
const MARGIN = { top: 24, right: 8, bottom: 32, left: 60 }
const MAX_BAR_WIDTH = 24
const CORNER = 4

const plotWidth = WIDTH - MARGIN.left - MARGIN.right
const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom
const baseline = MARGIN.top + plotHeight
const band = plotWidth / 12
const barWidth = Math.min(MAX_BAR_WIDTH, band * 0.6)
/** Anello di focus: rientrato dai bordi della fascia, dalla cima del disegno (include il valore sopra
 *  la barra più alta) fin sotto l'etichetta del mese. Lascia ≈ 9 unità libere per lato attorno alla barra. */
const FOCUS_INSET = 2
const FOCUS_TOP = FOCUS_INSET
const FOCUS_HEIGHT = HEIGHT - 2 * FOCUS_INSET

/** Percorso di una barra con gli angoli in alto arrotondati e la base squadrata. */
function barPath(x: number, y: number, w: number, h: number): string {
  if (h <= 0) return ''
  const r = Math.min(CORNER, h, w / 2)
  return [
    `M${x},${y + h}`,
    `V${y + r}`,
    `A${r},${r} 0 0 1 ${x + r},${y}`,
    `H${x + w - r}`,
    `A${r},${r} 0 0 1 ${x + w},${y + r}`,
    `V${y + h}`,
    'Z',
  ].join(' ')
}

export interface MonthlyChartProps {
  /** Energia di ciascun mese, kWh; indice 0 = gennaio. */
  monthlyKwh: number[]
}

export default function MonthlyChart({ monthlyKwh }: MonthlyChartProps) {
  const [active, setActive] = useState<number | null>(null)
  const scale = niceScale(Math.max(...monthlyKwh))
  const yOf = (v: number) => baseline - (v / scale.top) * plotHeight

  const maxIndex = monthlyKwh.indexOf(Math.max(...monthlyKwh))
  const minIndex = monthlyKwh.indexOf(Math.min(...monthlyKwh))

  const bars = monthlyKwh.map((kwh, i) => {
    const center = MARGIN.left + band * (i + 0.5)
    const y = yOf(kwh)
    return { i, kwh, center, x: center - barWidth / 2, y, h: baseline - y }
  })

  const activeBar = active === null ? null : bars[active]

  return (
    <figure className="chart">
      <div className="chart-plot">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="group"
          aria-label="Energia prodotta in ciascun mese, in kWh"
          onMouseLeave={() => setActive(null)}
        >
          {/* Griglia e valori dell'asse verticale */}
          {scale.ticks.map((t) => (
            <g key={t}>
              <line className="chart-grid" x1={MARGIN.left} x2={WIDTH - MARGIN.right} y1={yOf(t)} y2={yOf(t)} />
              <text className="chart-tick" x={MARGIN.left - 8} y={yOf(t)} textAnchor="end" dominantBaseline="middle">
                {formatNumber(t)}
              </text>
            </g>
          ))}

          {bars.map((b) => (
            <g
              key={b.i}
              data-month={b.i + 1}
              className={active !== null && active !== b.i ? 'chart-bar dimmed' : 'chart-bar'}
              tabIndex={0}
              role="img"
              aria-label={`${MONTH_NAMES[b.i]}: ${formatNumber(b.kwh)} kWh`}
              onMouseEnter={() => setActive(b.i)}
              onFocus={() => setActive(b.i)}
              onBlur={() => setActive(null)}
            >
              {/* Area sensibile più grande della barra, per un passaggio del mouse comodo. */}
              <rect className="chart-hit" x={b.center - band / 2} y={MARGIN.top} width={band} height={plotHeight} />
              {/* Anello di focus da tastiera (#20): visibile solo con :focus-visible, vedi index.css. */}
              <rect
                className="chart-focus"
                x={b.center - band / 2 + FOCUS_INSET}
                y={FOCUS_TOP}
                width={band - 2 * FOCUS_INSET}
                height={FOCUS_HEIGHT}
                rx={4}
                aria-hidden="true"
              />
              <path className="chart-bar-fill" d={barPath(b.x, b.y, barWidth, b.h)} />
              {(b.i === maxIndex || b.i === minIndex) && (
                <text className="chart-value" x={b.center} y={b.y - 6} textAnchor="middle">
                  {formatNumber(b.kwh)}
                </text>
              )}
              <text className="chart-tick" x={b.center} y={baseline + 18} textAnchor="middle">
                {MONTH_ABBR[b.i]}
              </text>
            </g>
          ))}
        </svg>

        {activeBar && (
          <div
            className="chart-tooltip"
            style={{
              left: `${(activeBar.center / WIDTH) * 100}%`,
              top: `${(activeBar.y / HEIGHT) * 100}%`,
            }}
            aria-hidden="true"
          >
            <strong>{MONTH_NAMES[activeBar.i]}</strong> {formatNumber(activeBar.kwh)} kWh
          </div>
        )}
      </div>

      <details className="chart-table">
        <summary>Tabella dei valori mensili</summary>
        <table>
          <thead>
            <tr>
              <th>Mese</th>
              <th>Energia (kWh)</th>
            </tr>
          </thead>
          <tbody>
            {monthlyKwh.map((kwh, i) => (
              <tr key={i}>
                <th>{MONTH_NAMES[i]}</th>
                <td>{formatNumber(kwh)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  )
}
