/**
 * Anteprima del pannello (issue #56, proposta A): disegno tecnico in assonometria di un pannello
 * su sostegni, posato su un disco di terreno con i punti cardinali, più un riquadro con la vista di
 * profilo quotata (l'angolo di inclinazione si legge sempre, qualunque sia l'orientamento).
 *
 * È solo un'illustrazione di inclinazione e orientamento (nessun sole, nessuna ombra, nessuna
 * animazione): la geometria viene da `projectPanel` (panelProjection.ts, testata a parte) e non
 * entra nel calcolo dell'energia. L'SVG è `aria-hidden`: i valori veri sono nei campi e nei comandi.
 * `data-face` dice quale faccia si vede: "front" (celle) o "back" (retro).
 * Legge il valore IMMEDIATO dei due angoli, non quello differito del calcolo.
 */

import { useId } from 'react'
import './panelPreview.css'
import { pointsAttribute, projectPanel, type Point2 } from './panelProjection'

const VIEW = { width: 460, height: 300 } as const
const SCENE = { ox: 272, oy: 172, scale: 67, elevationDeg: 26, yawDeg: 20, groundRadiusM: 2 } as const
const CARDINALS: readonly (readonly [string, number])[] = [['N', 0], ['E', 90], ['S', 180], ['O', 270]]
/** Gradi → radianti (π rad = 180°). */
const RAD = Math.PI / 180

const f1 = (n: number) => (Math.round(n * 10) / 10).toString()

export interface PanelPreviewProps {
  tiltDeg: number
  azimuthDeg: number
}

export default function PanelPreview({ tiltDeg, azimuthDeg }: PanelPreviewProps) {
  const hatchId = `hatch-${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const m = projectPanel(tiltDeg, azimuthDeg, SCENE)
  const R = SCENE.groundRadiusM
  const G = m.groundPoint

  // Anello tratteggiato interno e due assi del disco.
  const innerRing = Array.from({ length: 72 }, (_, k): Point2 => G(k * 5, R * 0.5))
  // Tacche sul bordo del disco: ogni 5°, più lunghe a 15° e a 45°.
  let ticks = ''
  for (let a = 0; a < 360; a += 5) {
    const len = a % 45 === 0 ? 0.2 : a % 15 === 0 ? 0.12 : 0.06
    const p = G(a, R)
    const q = G(a, R + len)
    ticks += `M${f1(p.x)} ${f1(p.y)}L${f1(q.x)} ${f1(q.y)}`
  }

  // Freccia: dal centro del disco verso l'azimut del pannello.
  const from = m.facing[0]
  const tip = G(azimuthDeg, R * 0.92)
  const ang = Math.atan2(tip.y - from.y, tip.x - from.x)
  const head = [[0, 0], [-11, -4.5], [-11, 4.5]]
    .map(([dx, dy]): Point2 => ({
      x: tip.x + dx * Math.cos(ang) - dy * Math.sin(ang),
      y: tip.y + dx * Math.sin(ang) + dy * Math.cos(ang),
    }))

  // Vista di profilo quotata (riquadro in alto a sinistra).
  const bx = 26
  const by = 94
  const len = 82
  const arcR = 44
  const beta = tiltDeg * RAD
  const tipX = bx + len * Math.cos(beta)
  const tipY = by - len * Math.sin(beta)
  const arc = Array.from({ length: 21 }, (_, i) =>
    `${f1(bx + arcR * Math.cos((beta * i) / 20))} ${f1(by - arcR * Math.sin((beta * i) / 20))}`).join('L')
  const labelAng = Math.max(beta / 2, 8 * RAD)
  const labelR = arcR + 19

  return (
    <div className="panel-preview">
      <svg viewBox={`0 0 ${VIEW.width} ${VIEW.height}`} aria-hidden="true" focusable="false" data-face={m.front ? 'front' : 'back'}>
        <defs>
          <pattern id={hatchId} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line className="pp-hatch" x1="0" y1="0" x2="0" y2="7" />
          </pattern>
        </defs>

        <polygon className="pp-ground" points={pointsAttribute(m.groundOutline)} />
        <polygon className="pp-guide" points={pointsAttribute(innerRing)} />
        <line className="pp-guide" x1={f1(G(0, R).x)} y1={f1(G(0, R).y)} x2={f1(G(180, R).x)} y2={f1(G(180, R).y)} />
        <line className="pp-guide" x1={f1(G(90, R).x)} y1={f1(G(90, R).y)} x2={f1(G(270, R).x)} y2={f1(G(270, R).y)} />
        <path className="pp-ticks" d={ticks} />

        {/* Lettere dei punti cardinali: fuori dal disco, disegnate PRIMA del pannello. */}
        {CARDINALS.map(([letter, az]) => {
          const p = G(az, R + 0.7)
          return <text key={letter} className="pp-letter" x={f1(p.x)} y={f1(p.y)}>{letter}</text>
        })}

        {/* Impronta verticale del pannello (non è l'ombra del sole). */}
        <polygon className="pp-footprint" points={pointsAttribute(m.footprint)} />

        {/* Direzione verso cui guarda il pannello. */}
        <line className="pp-facing" x1={f1(from.x)} y1={f1(from.y)} x2={f1(tip.x)} y2={f1(tip.y)} />
        <polygon className="pp-arrow" points={pointsAttribute(head)} />

        {m.front ? (
          <>
            <Posts posts={m.posts} />
            <polygon className="pp-cells" points={pointsAttribute(m.panel)} />
            {m.grid.map((s, i) => (
              <line key={i} className="pp-cell-line" x1={f1(s[0].x)} y1={f1(s[0].y)} x2={f1(s[1].x)} y2={f1(s[1].y)} />
            ))}
            <polygon className="pp-edge" points={pointsAttribute(m.panel)} />
          </>
        ) : (
          <>
            <polygon className="pp-back pp-edge" points={pointsAttribute(m.panel)} />
            <polygon className="pp-hatched" points={pointsAttribute(m.panel)} fill={`url(#${hatchId})`} />
            <Posts posts={m.posts} />
          </>
        )}

        {/* Vista di profilo quotata. */}
        <rect className="pp-side-box" x="4" y="4" width="128" height="104" rx="3" />
        <line className="pp-side-base" x1={bx - 10} y1={by} x2={bx + len + 10} y2={by} />
        <line className="pp-side-panel" x1={bx} y1={by} x2={f1(tipX)} y2={f1(tipY)} />
        <path className="pp-side-arc" d={`M${arc}`} />
        <circle className="pp-side-hub" cx={bx} cy={by} r="3.5" />
        <text
          className="pp-side-label"
          x={f1(bx + labelR * Math.cos(labelAng))}
          y={f1(by - labelR * Math.sin(labelAng) - (tiltDeg < 10 ? 8 : 0))}
        >
          {tiltDeg}°
        </text>
      </svg>
    </div>
  )
}

/** Sostegni verticali dal pannello al terreno, con il piede segnato. */
function Posts({ posts }: { posts: readonly (readonly [Point2, Point2])[] }) {
  return (
    <>
      {posts.map(([top, foot], i) => (
        <g key={i}>
          <line className="pp-post" x1={f1(top.x)} y1={f1(top.y)} x2={f1(foot.x)} y2={f1(foot.y)} />
          <circle className="pp-foot" cx={f1(foot.x)} cy={f1(foot.y)} r="2.6" />
        </g>
      ))}
    </>
  )
}
