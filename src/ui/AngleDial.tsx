/**
 * Comando circolare per l'inclinazione (quarto di cerchio) e l'orientamento (bussola) dei pannelli,
 * collegato a un campo numerico (issue #56, proposta A "Strumento di misura").
 *
 * Semantica: un `<input type="range">` NATIVO, trasparente e posato sopra il disegno, è l'unico
 * elemento per tastiera e lettori di schermo (nome "<etichetta> (slider)", `aria-valuetext` da
 * `dialValueText`); il disegno SVG è `aria-hidden`. La tastiera usa `dialKeyValue` (l'orientamento
 * gira 359 ↔ 0, cosa che uno slider nativo non farebbe). Il puntatore (mouse, dito, penna) usa
 * i Pointer Events: un tocco imposta il valore, il trascinamento lo aggiorna (`dialValueFromPoint`).
 * `touch-action: none` vale solo sull'area del comando (dial.css): fuori da essa la pagina scorre.
 *
 * Il valore mostrato è sempre quello IMMEDIATO dello stato dell'app (il calcolo della stima può
 * restare un attimo indietro, ma il comando no).
 * Geometria e tasti: `dialGeometry.ts` (testati a parte).
 */

import { useEffect, useRef, type KeyboardEvent, type PointerEvent } from 'react'
import './dial.css'
import {
  AZIMUTH_MAX, AZIMUTH_MIN, TILT_MAX, TILT_MIN,
  dialKeyValue, dialPoint, dialValueFromPoint, dialValueText, type DialKind,
} from './dialGeometry'
import NumberField from './NumberField'

/** Lato del disegno in unità SVG (viewBox quadrato: i due comandi hanno la stessa altezza). */
export const DIAL_VIEWBOX = 200
/** Quarto di cerchio: centro in basso a sinistra, raggio 128. */
const TILT = { cx: 24, cy: 176, r: 128 } as const
/** Bussola: centro al centro, raggio 64 (le lettere stanno fuori dal cerchio). */
const AZIMUTH = { cx: 100, cy: 100, r: 64 } as const
const CARDINALS: Record<number, string> = { 0: 'N', 90: 'E', 180: 'S', 270: 'O' }

/** Il punto (x, y) dello schermo cade dentro il rettangolo. */
const insideRect = (r: DOMRect, x: number, y: number) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom

const f1 = (n: number) => (Math.round(n * 10) / 10).toString()

/** Tacche del bordo come un solo tracciato ("M x y L x y …"); calcolate una volta per tipo. */
function ticksPath(kind: DialKind): string {
  const g = kind === 'tilt' ? TILT : AZIMUTH
  const parts: string[] = []
  const max = kind === 'tilt' ? 90 : 355
  for (let a = 0; a <= max; a += 5) {
    const len = kind === 'tilt' ? (a % 30 === 0 ? 15 : a % 10 === 0 ? 10 : 5) : (a % 45 === 0 ? 13 : a % 15 === 0 ? 8 : 4)
    const p = dialPoint(kind, a, g.cx, g.cy, g.r)
    const q = dialPoint(kind, a, g.cx, g.cy, g.r - len)
    parts.push(`M${f1(p.x)} ${f1(p.y)}L${f1(q.x)} ${f1(q.y)}`)
  }
  return parts.join('')
}
const TICKS = { tilt: ticksPath('tilt'), azimuth: ticksPath('azimuth') }

export interface AngleDialProps {
  kind: DialKind
  /** Etichetta del campo (es. "Inclinazione"); lo slider si chiama "<etichetta> (slider)". */
  label: string
  /** Valore intero, in gradi. */
  value: number
  onChange: (value: number) => void
  hint?: (value: number) => string
}

export default function AngleDial({ kind, label, value, onChange, hint }: AngleDialProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const dragging = useRef(false)
  /** Istante (ms) dell'ultimo evento del puntatore: i `change` nativi subito dopo un gesto vanno ignorati. */
  const lastGesture = useRef(0)
  const g = kind === 'tilt' ? TILT : AZIMUTH
  const min = kind === 'tilt' ? TILT_MIN : AZIMUTH_MIN
  const max = kind === 'tilt' ? TILT_MAX : AZIMUTH_MAX

  // Al tocco il browser gestisce lo slider nativo da solo (valore dalla sola x) e il suo evento
  // `input` sovrascriverebbe il valore giusto, calcolato da noi sull'angolo (`preventDefault` sul
  // solo `pointerdown` non lo ferma). React registra `touchstart` come passivo, quindi il listener
  // non passivo va aggiunto a mano: `preventDefault` toglie al browser la gestione nativa del tocco.
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    // Il browser "aggiusta" i tocchi vicini a un elemento e li attribuisce a lui: si ignorano quelli fuori dal riquadro.
    const stop = (e: TouchEvent) => {
      const t = e.touches[0] ?? e.changedTouches[0]
      if (t && !insideRect(el.getBoundingClientRect(), t.clientX, t.clientY)) return
      if (e.cancelable) e.preventDefault()
    }
    el.addEventListener('touchstart', stop, { passive: false })
    el.addEventListener('touchmove', stop, { passive: false })
    return () => {
      el.removeEventListener('touchstart', stop)
      el.removeEventListener('touchmove', stop)
    }
  }, [])

  /** Valore indicato dal puntatore: coordinate dello schermo → unità SVG (il comando è quadrato). */
  function update(e: PointerEvent<HTMLInputElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return
    const x = ((e.clientX - rect.left) / rect.width) * DIAL_VIEWBOX
    const y = ((e.clientY - rect.top) / rect.height) * DIAL_VIEWBOX
    const next = dialValueFromPoint(kind, x, y, g.cx, g.cy, g.r, value)
    if (next !== value) onChange(next)
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    const next = dialKeyValue(kind, e.key, value)
    if (next === null) return
    e.preventDefault()
    if (next !== value) onChange(next)
  }

  const handle = dialPoint(kind, value, g.cx, g.cy, g.r)
  const needleEnd = dialPoint(kind, value, g.cx, g.cy, g.r - (kind === 'tilt' ? 16 : 14))
  const tail = dialPoint('azimuth', value + 180, g.cx, g.cy, 22)

  return (
    <div className={`angle-dial angle-dial-${kind}`}>
      <div className="dial-box">
        <div className="dial-control">
          <input
            ref={inputRef}
            className="dial-input"
            type="range"
            min={min}
            max={max}
            step={1}
            value={value}
            aria-label={`${label} (slider)`}
            aria-valuetext={dialValueText(kind, value)}
            onChange={(e) => {
              // Cintura e bretelle: un `input` nativo VERO durante o subito dopo un gesto del puntatore
              // è il calcolo dello slider (solo x), non il nostro. Quelli da tastiera e da tecnologie
              // assistive (lontani da un gesto) e quelli sintetici (`fill`) passano.
              if (e.nativeEvent.isTrusted && (dragging.current || Date.now() - lastGesture.current < 400)) return
              onChange(e.target.valueAsNumber)
            }}
            onKeyDown={onKeyDown}
            onPointerDown={(e) => {
              if (e.pointerType === 'mouse' && e.button !== 0) return
              if (!insideRect(e.currentTarget.getBoundingClientRect(), e.clientX, e.clientY)) return
              // Niente comportamento nativo dello slider (che leggerebbe solo la x): si guida tutto da qui.
              e.preventDefault()
              e.currentTarget.setPointerCapture(e.pointerId)
              e.currentTarget.focus({ preventScroll: true })
              dragging.current = true
              lastGesture.current = Date.now()
              update(e)
            }}
            onPointerMove={(e) => { if (dragging.current) { lastGesture.current = Date.now(); update(e) } }}
            onPointerUp={(e) => {
              dragging.current = false
              lastGesture.current = Date.now()
              if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
            }}
            onPointerCancel={() => { dragging.current = false }}
            onLostPointerCapture={() => { dragging.current = false }}
          />
          <svg className="dial-svg" viewBox={`0 0 ${DIAL_VIEWBOX} ${DIAL_VIEWBOX}`} aria-hidden="true" focusable="false">
            {kind === 'tilt' ? (
              <>
                <path className="dial-face" d={`M${TILT.cx} ${TILT.cy}L${TILT.cx + TILT.r} ${TILT.cy}A${TILT.r} ${TILT.r} 0 0 0 ${TILT.cx} ${TILT.cy - TILT.r}Z`} />
                <path className="dial-ticks" d={TICKS.tilt} />
                <path className="dial-arc" d={`M${TILT.cx + TILT.r} ${TILT.cy}A${TILT.r} ${TILT.r} 0 0 0 ${TILT.cx} ${TILT.cy - TILT.r}`} />
                <path className="dial-axes" d={`M${TILT.cx + TILT.r} ${TILT.cy}H${TILT.cx}V${TILT.cy - TILT.r}`} />
                {[0, 30, 60, 90].map((v) => {
                  const p = dialPoint('tilt', v, TILT.cx, TILT.cy, TILT.r + 23)
                  return <text key={v} className="dial-num" x={f1(p.x)} y={f1(p.y)}>{v}°</text>
                })}
                {value > 0 && (
                  <path className="dial-sweep" d={`M${TILT.cx + TILT.r} ${TILT.cy}A${TILT.r} ${TILT.r} 0 0 0 ${f1(handle.x)} ${f1(handle.y)}`} />
                )}
                <line className="dial-needle dial-needle-thick" x1={TILT.cx} y1={TILT.cy} x2={f1(needleEnd.x)} y2={f1(needleEnd.y)} />
              </>
            ) : (
              <>
                <circle className="dial-face" cx={AZIMUTH.cx} cy={AZIMUTH.cy} r={AZIMUTH.r} />
                <path className="dial-ticks" d={TICKS.azimuth} />
                <circle className="dial-arc" cx={AZIMUTH.cx} cy={AZIMUTH.cy} r={AZIMUTH.r} />
                {Array.from({ length: 8 }, (_, k) => k * 45).map((a) => {
                  const big = a % 90 === 0
                  const p = dialPoint('azimuth', a, AZIMUTH.cx, AZIMUTH.cy, AZIMUTH.r + (big ? 26 : 27))
                  return (
                    <text key={a} className={big ? 'dial-letter' : 'dial-num'} x={f1(p.x)} y={f1(p.y)}>
                      {big ? CARDINALS[a] : a}
                    </text>
                  )
                })}
                <line className="dial-needle" x1={AZIMUTH.cx} y1={AZIMUTH.cy} x2={f1(needleEnd.x)} y2={f1(needleEnd.y)} />
                <line className="dial-needle" x1={AZIMUTH.cx} y1={AZIMUTH.cy} x2={f1(tail.x)} y2={f1(tail.y)} />
              </>
            )}
            <circle className="dial-hub" cx={g.cx} cy={g.cy} r={6} />
            <g transform={`translate(${f1(handle.x)} ${f1(handle.y)})`}>
              <circle className="dial-handle" r={12} />
              <circle className="dial-handle-dot" r={4} />
              {/* Anello di focus da tastiera: visibile solo con :focus-visible dello slider (dial.css). */}
              <circle className="dial-ring-halo" r={15.5} />
              <circle className="dial-ring" r={15.5} />
            </g>
          </svg>
        </div>
      </div>
      <NumberField label={label} unit="°" value={value} onChange={onChange}
        min={min} max={max} step={1} hint={hint} />
    </div>
  )
}
