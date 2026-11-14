/**
 * Proiezione di un pannello "tipo" su un disco di terreno, per disegnarlo in SVG (issue #56).
 * Logica pura: nessuna dipendenza da React né dal DOM.
 *
 * È un'illustrazione dei due angoli scelti (inclinazione e orientamento), non un calcolo fisico:
 * non entra nella stima dell'energia.
 *
 * Mondo (metri): x = Est, y = Nord, z = alto; il disco di terreno è centrato nell'origine.
 * Angoli in gradi; azimut da Nord in senso orario (convenzione del motore).
 * Schermo/SVG: X verso destra, Y verso il basso.
 */

export interface Point2 {
  readonly x: number
  readonly y: number
}

export type Segment2 = readonly [Point2, Point2]

export interface PanelProjectionOptions {
  /** Posizione sullo schermo del centro del disco di terreno. Predefinito 0. */
  readonly ox?: number
  /** Predefinito 0. */
  readonly oy?: number
  /** Unità dello schermo per metro. Predefinito 60. */
  readonly scale?: number
  /** Altezza dell'osservatore sull'orizzonte (gradi). Predefinito 26. */
  readonly elevationDeg?: number
  /**
   * Rotazione della vista attorno alla verticale (gradi): 0 = osservatore a Sud che guarda a Nord,
   * positivo = osservatore spostato da Sud verso Est. Predefinito 20 (decisione del PO del
   * 14/11/2026: da Sud esatto un pannello rivolto a Sud sembra piatto).
   */
  readonly yawDeg?: number
  /** Larghezza del pannello (m), lato orizzontale. Predefinito 1,13 (modulo da ~60 celle). */
  readonly panelWidthM?: number
  /** Lunghezza del pannello lungo la pendenza (m). Predefinito 1,72. */
  readonly panelHeightM?: number
  /** Altezza del bordo basso dal terreno (m). Predefinito 0,25. */
  readonly clearanceM?: number
  /** Raggio del disco di terreno (m). Predefinito 1,5. */
  readonly groundRadiusM?: number
  /** Colonne di celle (lungo il lato orizzontale). Predefinito 6. */
  readonly cols?: number
  /** Righe di celle (lungo la pendenza). Predefinito 10. */
  readonly rows?: number
}

export interface PanelProjection {
  /**
   * Angoli del pannello: basso-sx, basso-dx, alto-dx, alto-sx. "Basso/alto" lungo la pendenza;
   * "sinistra/destra" come li vede chi sta dietro il pannello e guarda verso l'azimut
   * (per un pannello a Sud: basso-sx = angolo a Est).
   */
  readonly panel: readonly Point2[]
  /** true = si vede la faccia con le celle; false = si vede il retro. */
  readonly front: boolean
  /** Linee fra le celle: prima le (cols − 1) verticali, poi le (rows − 1) orizzontali. */
  readonly grid: readonly Segment2[]
  /**
   * Proiezione **verticale** del pannello sul terreno (stesso ordine degli angoli di `panel`).
   * NON è l'ombra del sole: serve solo a far capire la posizione del pannello nello spazio.
   */
  readonly footprint: readonly Point2[]
  /** Sostegni verticali [angolo del pannello, piede sul terreno], nello stesso ordine di `panel`. */
  readonly posts: readonly Segment2[]
  /** Bordo del disco di terreno come poligono (`GROUND_OUTLINE_POINTS` punti, da Nord in senso orario). */
  readonly groundOutline: readonly Point2[]
  /** Punto sul terreno a un azimut (gradi da Nord) e a una distanza (m) dal centro: lettere N/E/S/O, tacche. */
  readonly groundPoint: (azimuthDeg: number, radiusM: number) => Point2
  /** Direzione verso cui guarda il pannello: dal centro del disco al bordo, all'azimut del pannello. */
  readonly facing: Segment2
}

/** Punti del poligono del disco: uno ogni 5°, abbastanza per sembrare un'ellisse liscia a 60 px/m. */
export const GROUND_OUTLINE_POINTS = 72

type Vec3 = readonly [number, number, number]

/** Gradi → radianti (π rad = 180°). */
const RAD = Math.PI / 180

/**
 * Calcola i punti 2D del disegno.
 *
 * Derivazione (geometria del pannello, stessa di `engine/irradiance.ts`): Duffie & Beckman,
 * "Solar Engineering of Thermal Processes", eq. 1.6.3, cos θ = cos z cos β + sin z sin β cos(γs − α),
 * è il prodotto scalare fra il versore del sole (sin z sin γs, sin z cos γs, cos z) e la normale
 * qui sotto (x = Est, y = Nord, azimut da Nord):
 * - normale n = (sin β sin α, sin β cos α, cos β): per β = 0 punta in alto, per β = 90° è
 *   orizzontale verso l'azimut α;
 * - lato orizzontale u = (cos α, −sin α, 0): orizzontale e perpendicolare alla direzione
 *   (sin α, cos α, 0), quindi a n;
 * - salita lungo il pannello v = (−cos β sin α, −cos β cos α, sin β) = n × u: dal bordo basso
 *   (verso l'azimut) a quello alto. u, v, n sono una terna ortonormale.
 * - centro del pannello c = (0, 0, clearance + (h/2)·sin β): il bordo basso sta a `clearance`
 *   dal terreno.
 *
 * Camera (proiezione ortografica, senza prospettiva):
 * 1. rotazione attorno alla verticale di ψ = yaw: x' = x cos ψ + y sin ψ, y' = −x sin ψ + y cos ψ
 *    (con ψ = 90° il punto a Est (1, 0) va in (0, −1), cioè verso l'osservatore: l'osservatore è
 *    a Est);
 * 2. osservatore a Sud (y' negativo) alzato di ε: lo schermo ha come asse orizzontale x' e come
 *    asse verticale la proiezione di (0, sin ε, cos ε) (y' "lontano" e z "alto" vanno entrambi in
 *    su sullo schermo): X = ox + s·x', Y = oy − s·(y' sin ε + z cos ε).
 * La direzione verso l'osservatore è d = (0, −cos ε, sin ε) (ortogonale ai due assi dello
 * schermo); si vede la faccia con le celle se n'·d > 0.
 *
 * Per aggiungere la prospettiva (PR2) basta cambiare `toScreen`: la profondità di un punto è
 * y' cos ε − z sin ε (= −p'·d).
 */
export function projectPanel(tiltDeg: number, azimuthDeg: number, options: PanelProjectionOptions = {}): PanelProjection {
  const {
    ox = 0,
    oy = 0,
    scale = 60,
    elevationDeg = 26,
    yawDeg = 20,
    panelWidthM = 1.13,
    panelHeightM = 1.72,
    clearanceM = 0.25,
    groundRadiusM = 1.5,
    cols = 6,
    rows = 10,
  } = options

  // Azimut ridotto a [0, 360): α e α + 360 danno lo stesso disegno anche con valori molto grandi.
  const beta = tiltDeg * RAD
  const alpha = normalizeDeg(azimuthDeg) * RAD
  const sb = Math.sin(beta)
  const cb = Math.cos(beta)
  const sa = Math.sin(alpha)
  const ca = Math.cos(alpha)

  const u: Vec3 = [ca, -sa, 0]
  const v: Vec3 = [-cb * sa, -cb * ca, sb]
  const n: Vec3 = [sb * sa, sb * ca, cb]
  const center: Vec3 = [0, 0, clearanceM + (panelHeightM / 2) * sb]

  const psi = yawDeg * RAD
  const cpsi = Math.cos(psi)
  const spsi = Math.sin(psi)
  const eps = elevationDeg * RAD
  const ceps = Math.cos(eps)
  const seps = Math.sin(eps)

  /** Passo 1 della camera: rotazione attorno alla verticale. */
  const rotate = (p: Vec3): Vec3 => [p[0] * cpsi + p[1] * spsi, -p[0] * spsi + p[1] * cpsi, p[2]]
  /** Passo 2: proiezione ortografica sullo schermo. */
  const toScreen = (p: Vec3): Point2 => {
    const q = rotate(p)
    return { x: ox + scale * q[0], y: oy - scale * (q[1] * seps + q[2] * ceps) }
  }

  /** Punto del pannello: i, j ∈ [−1, 1] (−1 = sinistra / basso, +1 = destra / alto). */
  const onPanel = (i: number, j: number): Vec3 => {
    const a = i * (panelWidthM / 2)
    const b = j * (panelHeightM / 2)
    return [center[0] + a * u[0] + b * v[0], center[1] + a * u[1] + b * v[1], center[2] + a * u[2] + b * v[2]]
  }
  const ground = (p: Vec3): Vec3 => [p[0], p[1], 0]

  const corners: Vec3[] = [onPanel(-1, -1), onPanel(1, -1), onPanel(1, 1), onPanel(-1, 1)]

  const grid: Segment2[] = []
  for (let k = 1; k < cols; k++) {
    const i = -1 + (2 * k) / cols
    grid.push([toScreen(onPanel(i, -1)), toScreen(onPanel(i, 1))])
  }
  for (let k = 1; k < rows; k++) {
    const j = -1 + (2 * k) / rows
    grid.push([toScreen(onPanel(-1, j)), toScreen(onPanel(1, j))])
  }

  const groundPoint = (az: number, radiusM: number): Point2 => {
    const a = normalizeDeg(az) * RAD
    // Azimut da Nord in senso orario: Est = x, Nord = y.
    return toScreen([radiusM * Math.sin(a), radiusM * Math.cos(a), 0])
  }

  const nr = rotate(n)
  return {
    panel: corners.map(toScreen),
    front: -nr[1] * ceps + nr[2] * seps > 0,
    grid,
    footprint: corners.map((p) => toScreen(ground(p))),
    posts: corners.map((p): Segment2 => [toScreen(p), toScreen(ground(p))]),
    groundOutline: Array.from({ length: GROUND_OUTLINE_POINTS }, (_, k) =>
      groundPoint((k * 360) / GROUND_OUTLINE_POINTS, groundRadiusM),
    ),
    groundPoint,
    facing: [toScreen([0, 0, 0]), groundPoint(azimuthDeg, groundRadiusM)],
  }
}

/** Angolo in [0, 360). "+ 0" toglie un eventuale −0. */
function normalizeDeg(deg: number): number {
  return (((deg % 360) + 360) % 360) + 0
}

/**
 * Valore dell'attributo SVG `points` ("x,y x,y …"), con 1 decimale: un decimo di unità SVG è
 * invisibile e il markup resta corto. −0,0 viene scritto "0.0".
 */
export function pointsAttribute(points: readonly Point2[]): string {
  return points.map((p) => `${fixed1(p.x)},${fixed1(p.y)}`).join(' ')
}

function fixed1(n: number): string {
  const s = n.toFixed(1)
  return s === '-0.0' ? '0.0' : s
}
