import { describe, expect, it } from 'vitest'
import { GROUND_OUTLINE_POINTS, pointsAttribute, projectPanel, type Point2 } from './panelProjection'

// Riferimento: le formule di `projectPanel` applicate a mano (trigonometria elementare).
// Costanti usate nei calcoli: sin 26° = 0,4383711, cos 26° = 0,8987940,
// sin 20° = 0,3420201, cos 20° = 0,9396926. Pannello predefinito 1,13 × 1,72 m
// (metà: 0,565 e 0,86), distanza dal terreno 0,25 m. Scala 100 e origine (0, 0) per leggibilità.
// Tolleranza 1e-4 unità SVG: i valori a mano sono scritti con 6-7 cifre significative
// (un decimillesimo di unità è comunque mille volte sotto l'arrotondamento di `pointsAttribute`).
const DIGITS = 4

function expectPoints(actual: readonly Point2[], expected: readonly (readonly [number, number])[]) {
  expect(actual).toHaveLength(expected.length)
  actual.forEach((p, k) => {
    expect(p.x).toBeCloseTo(expected[k][0], DIGITS)
    expect(p.y).toBeCloseTo(expected[k][1], DIGITS)
  })
}

describe('projectPanel: valori calcolati a mano', () => {
  it('pannello piatto a Sud (β = 0, α = 180), yaw 0', () => {
    // u = (cos 180, −sin 180, 0) = (−1, 0, 0); v = (0, 1, 0); centro z = 0,25.
    // Angolo (i, j) = (−0,565·i, 0,86·j, 0,25):
    //   basso-sx (0,565, −0,86), basso-dx (−0,565, −0,86), alto-dx (−0,565, 0,86), alto-sx (0,565, 0,86).
    // Yaw 0: X = 100·x; Y = −100·(y·sin 26° + 0,25·cos 26°).
    //   y = −0,86: Y = −100·(−0,3769992 + 0,2246985) = 15,23007
    //   y = +0,86: Y = −100·( 0,3769992 + 0,2246985) = −60,16977
    const p = projectPanel(0, 180, { scale: 100, yawDeg: 0 })
    expectPoints(p.panel, [[56.5, 15.23007], [-56.5, 15.23007], [-56.5, -60.16977], [56.5, -60.16977]])
    // Faccia verso l'alto, osservatore alzato di 26°: si vedono le celle.
    expect(p.front).toBe(true)
    // Impronta a z = 0: Y = −100·y·sin 26° = ±37,69992.
    expectPoints(p.footprint, [[56.5, 37.69992], [-56.5, 37.69992], [-56.5, -37.69992], [56.5, -37.69992]])
    // Direzione: dal centro (0, 0) al terreno a Sud a 1,5 m: (0, −1,5, 0) → Y = 150·sin 26° = 65,75567.
    expectPoints(p.facing, [[0, 0], [0, 65.75567]])
  })

  it('pannello verticale a Sud (β = 90, α = 180), yaw 0', () => {
    // u = (−1, 0, 0); v = (0, 0, 1); centro z = 0,25 + 0,86 = 1,11.
    // basso-sx (0,565, 0, 0,25), basso-dx (−0,565, 0, 0,25), alto-dx (−0,565, 0, 1,97), alto-sx (0,565, 0, 1,97).
    //   z = 0,25: Y = −100·0,25·cos 26° = −22,46985
    //   z = 1,97: Y = −100·1,97·cos 26° = −177,06243
    const p = projectPanel(90, 180, { scale: 100, yawDeg: 0 })
    expectPoints(p.panel, [[56.5, -22.46985], [-56.5, -22.46985], [-56.5, -177.06243], [56.5, -177.06243]])
    // n = (0, −1, 0) verso l'osservatore a Sud: n·d = cos 26° > 0.
    expect(p.front).toBe(true)
    // Sostegno del primo angolo: da (56,5, −22,46985) al piede (56,5, 0).
    expectPoints(p.posts[0], [[56.5, -22.46985], [56.5, 0]])
  })

  it('pannello piatto a Sud (β = 0, α = 180), yaw 20', () => {
    // Angoli del mondo come sopra; rotazione: x' = x·cos 20° + y·sin 20°, y' = −x·sin 20° + y·cos 20°.
    // basso-sx (0,565, −0,86): x' = 0,5309263 − 0,2941373 = 0,2367890; y' = −0,1932414 − 0,8081357 = −1,0013771
    //   X = 23,67890; Y = −100·(−1,0013771·0,4383711 + 0,2246985) = 21,42763
    // basso-dx (−0,565, −0,86): x' = −0,5309263 − 0,2941373 = −0,8250636; y' = 0,1932414 − 0,8081357 = −0,6148943
    //   X = −82,50636; Y = −100·(−0,6148943·0,4383711 + 0,2246985) = 4,48534
    // alto-dx (−0,565, 0,86): x' = −0,2367890; y' = 1,0013771 → X = −23,67890;
    //   Y = −100·(0,4389748 + 0,2246985) = −66,36733
    // alto-sx (0,565, 0,86): x' = 0,8250636; y' = 0,6148943 → X = 82,50636;
    //   Y = −100·(0,2695517 + 0,2246985) = −49,42502
    const p = projectPanel(0, 180, { scale: 100, yawDeg: 20 })
    expectPoints(p.panel, [[23.6789, 21.42763], [-82.50636, 4.48534], [-23.6789, -66.36733], [82.50636, -49.42502]])
    expect(p.front).toBe(true)
    // Direzione: Sud a 1,5 m (0, −1,5): x' = −1,5·sin 20° = −0,5130302; y' = −1,5·cos 20° = −1,4095389
    //   X = −51,30302; Y = 140,95389·sin 26° = 61,79012.
    expectPoints(p.facing, [[0, 0], [-51.30302, 61.79012]])
  })

  it('pannello verticale a Sud (β = 90, α = 180), yaw 20', () => {
    // basso-sx (0,565, 0, 0,25): x' = 0,565·cos 20° = 0,5309263; y' = −0,565·sin 20° = −0,1932414
    //   y'·sin 26° = −0,0847113; z·cos 26° = 0,2246985
    //   X = 53,09263; Y = −100·(−0,0847113 + 0,2246985) = −13,99872
    // basso-dx (−0,565, 0, 0,25): X = −53,09263; Y = −100·(0,0847113 + 0,2246985) = −30,94098
    // alto-dx (−0,565, 0, 1,97): z·cos 26° = 1,7706243; Y = −100·(0,0847113 + 1,7706243) = −185,53356
    // alto-sx (0,565, 0, 1,97): Y = −100·(−0,0847113 + 1,7706243) = −168,59130
    const p = projectPanel(90, 180, { scale: 100, yawDeg: 20 })
    expectPoints(p.panel, [[53.09263, -13.99872], [-53.09263, -30.94098], [-53.09263, -185.53356], [53.09263, -168.5913]])
    expect(p.front).toBe(true)
  })

  it('origine e scala spostano e ingrandiscono il disegno', () => {
    // Stessa scena di β = 0, α = 180, yaw 0 con scala 50 e origine (200, 120):
    // basso-sx (200 + 0,5·56,5, 120 + 0,5·15,23007) = (228,25, 127,61503).
    const p = projectPanel(0, 180, { scale: 50, ox: 200, oy: 120, yawDeg: 0 })
    expectPoints([p.panel[0]], [[228.25, 127.61503]])
  })
})

describe('projectPanel: faccia visibile', () => {
  // d = (0, −cos 26°, sin 26°) = (0, −0,8987940, 0,4383711).
  it('Sud 35°: faccia (yaw 0 e 20)', () => {
    // n = (0, −sin 35°, cos 35°) = (0, −0,5735764, 0,8191520).
    // Yaw 0: n·d = 0,5155251 + 0,3590941 > 0.
    expect(projectPanel(35, 180, { yawDeg: 0 }).front).toBe(true)
    // Yaw 20: n'y = −0,5735764·cos 20° = −0,5389905; n·d = 0,4844393 + 0,3590941 > 0.
    expect(projectPanel(35, 180, { yawDeg: 20 }).front).toBe(true)
    expect(projectPanel(35, 180).front).toBe(true)
  })

  it('Nord 60°: retro (yaw 0 e 20)', () => {
    // n = (0, sin 60°, cos 60°) = (0, 0,8660254, 0,5).
    // Yaw 0: n·d = −0,7783900 + 0,2191856 < 0.
    expect(projectPanel(60, 0, { yawDeg: 0 }).front).toBe(false)
    // Yaw 20: n'y = 0,8660254·cos 20° = 0,8138029; n·d = −0,7314422 + 0,2191856 < 0.
    expect(projectPanel(60, 0, { yawDeg: 20 }).front).toBe(false)
    expect(projectPanel(60, 0).front).toBe(false)
  })

  it('Est 90° visto da Sud spostato verso Est (yaw 20): faccia; con yaw −20: retro', () => {
    // n = (1, 0, 0). Yaw 20: n'y = −sin 20° = −0,3420201; n·d = 0,3074071 > 0.
    expect(projectPanel(90, 90, { yawDeg: 20 }).front).toBe(true)
    // Yaw −20: n'y = +0,3420201; n·d = −0,3074071 < 0.
    expect(projectPanel(90, 90, { yawDeg: -20 }).front).toBe(false)
  })
})

describe('projectPanel: struttura', () => {
  it('numero di elementi: 4 angoli, (cols − 1) + (rows − 1) linee, 72 punti del disco', () => {
    const p = projectPanel(35, 180)
    expect(p.panel).toHaveLength(4)
    expect(p.footprint).toHaveLength(4)
    expect(p.posts).toHaveLength(4)
    expect(p.grid).toHaveLength(5 + 9)
    expect(p.groundOutline).toHaveLength(GROUND_OUTLINE_POINTS)
    expect(projectPanel(35, 180, { cols: 3, rows: 4 }).grid).toHaveLength(2 + 3)
    expect(projectPanel(35, 180, { cols: 1, rows: 1 }).grid).toHaveLength(0)
  })

  it('le linee della griglia dividono i lati in parti uguali', () => {
    // Proiezione ortografica = trasformazione affine: le divisioni restano uguali sullo schermo.
    // Prima linea verticale (k = 1 su 6): parte a 1/6 del lato basso, da basso-sx a basso-dx.
    const p = projectPanel(35, 200, { cols: 6, rows: 10 })
    const [bl, br, , tl] = p.panel
    expect(p.grid[0][0].x).toBeCloseTo(bl.x + (br.x - bl.x) / 6, 9)
    expect(p.grid[0][0].y).toBeCloseTo(bl.y + (br.y - bl.y) / 6, 9)
    // Prima linea orizzontale (indice 5): a 1/10 del lato sinistro, da basso-sx ad alto-sx.
    expect(p.grid[5][0].x).toBeCloseTo(bl.x + (tl.x - bl.x) / 10, 9)
    expect(p.grid[5][0].y).toBeCloseTo(bl.y + (tl.y - bl.y) / 10, 9)
  })

  it('groundPoint: punti cardinali con yaw 0 (Nord in alto, Est a destra)', () => {
    // Raggio 1 m, scala 100: N (0, 1, 0) → Y = −100·sin 26° = −43,83711; E (1, 0, 0) → X = 100.
    const p = projectPanel(35, 180, { scale: 100, yawDeg: 0 })
    expectPoints([p.groundPoint(0, 1), p.groundPoint(90, 1), p.groundPoint(180, 1), p.groundPoint(270, 1)], [
      [0, -43.83711], [100, 0], [0, 43.83711], [-100, 0],
    ])
    // Il primo punto del disco è il Nord sul bordo (1,5 m).
    expectPoints([p.groundOutline[0]], [[0, -65.75567]])
  })

  it('i piedi dei sostegni coincidono con l\'impronta', () => {
    const p = projectPanel(42, 123)
    p.posts.forEach((post, k) => {
      expect(post[0]).toEqual(p.panel[k])
      expect(post[1]).toEqual(p.footprint[k])
    })
  })

  it('simmetria Est/Ovest con yaw 0: α e 360 − α sono speculari rispetto a X = ox', () => {
    for (const [tilt, az] of [[35, 90], [60, 135], [10, 30], [90, 250]]) {
      const a = projectPanel(tilt, az, { ox: 0, yawDeg: 0 })
      const b = projectPanel(tilt, 360 - az, { ox: 0, yawDeg: 0 })
      // Lo specchio scambia sinistra e destra: basso-sx ↔ basso-dx, alto-dx ↔ alto-sx.
      const mirrored = [b.panel[1], b.panel[0], b.panel[3], b.panel[2]]
      a.panel.forEach((p, k) => {
        expect(p.x).toBeCloseTo(-mirrored[k].x, 9)
        expect(p.y).toBeCloseTo(mirrored[k].y, 9)
      })
      expect(a.front).toBe(b.front)
      expect(a.facing[1].x).toBeCloseTo(-b.facing[1].x, 9)
      expect(a.facing[1].y).toBeCloseTo(b.facing[1].y, 9)
    }
  })

  it('valori predefiniti: yaw 20, elevazione 26, scala 60, origine (0, 0)', () => {
    // `groundPoint` è una funzione (diversa a ogni chiamata): si confronta il resto e un suo punto.
    const { groundPoint: g1, ...a } = projectPanel(35, 180)
    const { groundPoint: g2, ...b } = projectPanel(35, 180, {
      ox: 0, oy: 0, scale: 60, elevationDeg: 26, yawDeg: 20, panelWidthM: 1.13, panelHeightM: 1.72,
      clearanceM: 0.25, groundRadiusM: 1.5, cols: 6, rows: 10,
    })
    expect(a).toEqual(b)
    expect(g1(45, 1)).toEqual(g2(45, 1))
  })
})

describe('projectPanel: prospettiva (distanceM)', () => {
  // Riferimento: modello a foro stenopeico (Hartley & Zisserman, §6.1, eq. 6.1) applicato a mano.
  // Vista: elevazione 30° (sin = 0,5; cos = √3/2 = 0,8660254038), yaw 0, scala 100, origine (0, 0),
  // osservatore a D = 10 m. Per un punto ruotato (x', y', z):
  //   Z = D + y'·cos ε − z·sin ε;  k = 100·D / Z;  X = k·x';  Y = −k·(y'·sin ε + z·cos ε).
  // Tolleranza 1e-9: i valori attesi sono calcolati in doppia precisione da espressioni chiuse
  // (gli errori di arrotondamento delle due strade sono ~1e-13).
  const opts = { scale: 100, elevationDeg: 30, yawDeg: 0, distanceM: 10 } as const
  const close = (p: Point2, x: number, y: number) => {
    expect(Math.abs(p.x - x)).toBeLessThan(1e-9)
    expect(Math.abs(p.y - y)).toBeLessThan(1e-9)
  }

  it('punti del terreno: davanti più grandi, dietro più piccoli, di lato invariati', () => {
    const g = projectPanel(35, 180, opts).groundPoint
    // Nord a 4 m, (0, 4, 0): Z = 10 + 4·0,8660254 = 13,4641016; k = 1000/Z = 74,2715726;
    //   Y = −k·(4·0,5) = −148,5431451.
    close(g(0, 4), 0, -1000 / (10 + 4 * Math.sqrt(3) / 2) * 2)
    expect(g(0, 4).y).toBeCloseTo(-148.5431451, 6)
    // Sud a 4 m, (0, −4, 0): Z = 10 − 3,4641016 = 6,5358984; k = 153,0011547; Y = +306,0023094.
    close(g(180, 4), 0, (1000 / (10 - 4 * Math.sqrt(3) / 2)) * 2)
    expect(g(180, 4).y).toBeCloseTo(306.0023094, 6)
    // Est a 3 m, (3, 0, 0): Z = D, k = 100 → (300, 0), come nella vista ortografica.
    close(g(90, 3), 300, 0)
  })

  it('angoli di un pannello verticale verso Sud (β = 90, α = 180), 2 × 2 m, poggiato a terra', () => {
    // u = (−1, 0, 0), v = (0, 0, 1), centro (0, 0, 1). Basso-sx = c − u − v = (1, 0, 0): Z = 10, k = 100 → (100, 0).
    // Alto-sx = c − u + v = (1, 0, 2): Z = 10 − 2·0,5 = 9; k = 111,1111111; X = 111,1111111;
    //   Y = −k·2·0,8660254 = −192,4500897.
    const p = projectPanel(90, 180, { ...opts, panelWidthM: 2, panelHeightM: 2, clearanceM: 0 })
    close(p.panel[0], 100, 0)
    close(p.panel[3], 1000 / 9, (-1000 / 9) * Math.sqrt(3))
    expect(p.panel[3].y).toBeCloseTo(-192.4500897, 6)
    // Normale (0, −1, 0), osservatore E = (0, −8,66, 5), centro (0, 0, 1): n·(E − c) = 8,66 > 0 → celle.
    expect(p.front).toBe(true)
    expect(projectPanel(90, 0, { ...opts, panelWidthM: 2, panelHeightM: 2, clearanceM: 0 }).front).toBe(false)
  })

  it('la faccia vista dipende dalla posizione dell\'osservatore, non solo dalla direzione', () => {
    // Pannello piatto (normale in alto) a 6 m da terra; l'osservatore a 10 m con elevazione 30° sta a
    // 5 m d'altezza, cioè SOTTO il pannello: vede il retro. La vista ortografica (direzione) vede le celle.
    const ortho = { scale: 100, elevationDeg: 30, yawDeg: 0, clearanceM: 6 }
    expect(projectPanel(0, 180, { ...ortho, distanceM: 10 }).front).toBe(false)
    expect(projectPanel(0, 180, ortho).front).toBe(true)
  })

  it('con una distanza enorme tende alla vista ortografica', () => {
    const a = projectPanel(35, 200, { distanceM: 1e9 })
    const b = projectPanel(35, 200)
    a.panel.forEach((p, k) => {
      expect(p.x).toBeCloseTo(b.panel[k].x, 4)
      expect(p.y).toBeCloseTo(b.panel[k].y, 4)
    })
    expect(a.front).toBe(b.front)
  })

  it('distanza non finita o ≤ 0: RangeError', () => {
    for (const d of [0, -1, -0, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(() => projectPanel(35, 180, { distanceM: d })).toThrow(RangeError)
    }
  })

  it('punto sull\'osservatore o dietro di lui: RangeError', () => {
    // Disco di 3 m con l'osservatore a 1 m: il punto a Sud del bordo ha Z = 1 − 3·cos 30° < 0.
    expect(() => projectPanel(35, 180, { ...opts, distanceM: 1, groundRadiusM: 3 })).toThrow(RangeError)
    // Esattamente sull'osservatore (Z = 0): elevazione 0, punto a Sud a D metri.
    const g = projectPanel(35, 180, { scale: 100, elevationDeg: 0, yawDeg: 0, distanceM: 10 }).groundPoint
    expect(() => g(180, 10)).toThrow(RangeError)
    expect(() => g(180, 9.999)).not.toThrow()
  })
})

describe('pointsAttribute', () => {
  it('coppie "x,y" separate da spazi, 1 decimale, niente "-0.0"', () => {
    expect(pointsAttribute([{ x: 1, y: 2 }, { x: -3.14159, y: 10.06 }, { x: -0.04, y: -0 }])).toBe('1.0,2.0 -3.1,10.1 0.0,0.0')
    expect(pointsAttribute([])).toBe('')
  })
})
