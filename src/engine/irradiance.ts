/**
 * Irradianza sul piano dei pannelli ("plane of array", POA) a partire dalle componenti
 * misurate sul piano orizzontale.
 *
 * Il modello è lo stesso usato da PVGIS, così il confronto con PVGIS misura i nostri
 * errori e non la differenza tra due modelli diversi:
 * - diretta: geometria esatta (Duffie & Beckman, "Solar Engineering of Thermal
 *   Processes", 4ª ed., 2013, eq. 1.6.3);
 * - diffusa: modello di Muneer (1990) nella forma usata dal modulo r.sun di GRASS GIS,
 *   su cui si basa PVGIS (J. Hofierka, M. Šúri, "The solar radiation model for Open
 *   source GIS: implementation and applications", Proc. Open Source GIS – GRASS users
 *   conference, Trento, 2002; M. Šúri, J. Hofierka, "A new GIS-based solar radiation
 *   model and its application to photovoltaic assessments", Transactions in GIS 8(2),
 *   2004, pp. 175-190);
 * - riflessa dal suolo: modello isotropo (Duffie & Beckman, eq. 2.15.1) con albedo 0,2,
 *   lo stesso valore di PVGIS (verificato sulle serie orarie di PVGIS, vedi i test).
 *
 * Convenzioni del motore: angoli in gradi, azimut da Nord in senso orario
 * (0 = N, 90 = E, 180 = S, 270 = O), istanti come `Date` in UTC.
 */

const DEG = Math.PI / 180
const sinD = (x: number) => Math.sin(x * DEG)
const cosD = (x: number) => Math.cos(x * DEG)

/**
 * Costante solare usata da PVGIS/r.sun, W/m² (Hofierka & Šúri 2002).
 * Il valore misurato più recente è 1361 W/m² (Kopp & Lean, Geophys. Res. Lett. 38, 2011),
 * ma qui serve solo nel rapporto Kb del modello di Muneer, i cui coefficienti sono
 * stati usati da PVGIS con 1367: per riprodurre PVGIS teniamo il suo valore.
 */
export const SOLAR_CONSTANT_WM2 = 1367

/** Albedo (riflettanza del suolo) usata da PVGIS: 0,2 (prato/terreno generico). */
export const DEFAULT_ALBEDO = 0.2

/** Giorno dell'anno in UTC: 1 = 1° gennaio. */
function dayOfYearUtc(date: Date): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 1)
  return Math.floor((date.getTime() - start) / 86_400_000) + 1
}

/**
 * Irradianza extraterrestre su un piano perpendicolare ai raggi del sole, W/m².
 * Varia di ±3,3 % nell'anno perché l'orbita della Terra è ellittica.
 * Formula di r.sun (Hofierka & Šúri 2002): G0 · [1 + 0,03344 · cos(j′ − 0,048869)],
 * con j′ = 2π · giorno / 365,25 (radianti).
 */
export function extraterrestrialIrradiance(date: Date): number {
  if (!Number.isFinite(date.getTime())) throw new RangeError('Data non valida')
  const jPrime = (2 * Math.PI * dayOfYearUtc(date)) / 365.25
  return SOLAR_CONSTANT_WM2 * (1 + 0.03344 * Math.cos(jPrime - 0.048869))
}

/**
 * Coseno dell'angolo di incidenza θ tra i raggi del sole e la normale al pannello.
 * Duffie & Beckman, eq. 1.6.3 (scritta con l'azimut solare e quello del pannello):
 *   cos θ = cos z · cos β + sin z · sin β · cos(γs − γ)
 * z = zenit solare, β = inclinazione, γs = azimut solare, γ = azimut del pannello.
 * Negativo quando il sole è dietro il pannello.
 */
export function cosAngleOfIncidence(
  sunZenithDeg: number,
  sunAzimuthDeg: number,
  tiltDeg: number,
  panelAzimuthDeg: number,
): number {
  return (
    cosD(sunZenithDeg) * cosD(tiltDeg) +
    sinD(sunZenithDeg) * sinD(tiltDeg) * cosD(sunAzimuthDeg - panelAzimuthDeg)
  )
}

/** Angolo di incidenza θ in gradi, in [0, 180]. Oltre 90° il sole è dietro il pannello. */
export function angleOfIncidence(
  sunZenithDeg: number,
  sunAzimuthDeg: number,
  tiltDeg: number,
  panelAzimuthDeg: number,
): number {
  const c = cosAngleOfIncidence(sunZenithDeg, sunAzimuthDeg, tiltDeg, panelAzimuthDeg)
  return Math.acos(Math.min(1, Math.max(-1, c))) / DEG
}

export interface PoaInput {
  /** Irradianza diretta normale (DNI), W/m². */
  dniWm2: number
  /** Irradianza diffusa orizzontale (DHI), W/m². */
  dhiWm2: number
  /** Irradianza globale orizzontale (GHI), W/m²: serve per la componente riflessa. */
  ghiWm2: number
  /** Angolo zenitale GEOMETRICO del sole (senza rifrazione), gradi. */
  sunZenithDeg: number
  /** Azimut del sole da Nord in senso orario, gradi. */
  sunAzimuthDeg: number
  /** Irradianza extraterrestre normale (vedi `extraterrestrialIrradiance`), W/m². */
  extraterrestrialWm2: number
  /** Inclinazione dei pannelli sull'orizzontale, gradi: 0 = piatti, 90 = verticali. */
  tiltDeg: number
  /** Azimut verso cui guardano i pannelli, da Nord in senso orario: 180 = Sud. */
  panelAzimuthDeg: number
  /** Riflettanza del suolo, 0-1. Predefinita: 0,2 come PVGIS. */
  albedo?: number
}

export interface PoaIrradiance {
  /** Componente diretta sul piano dei pannelli, W/m². */
  beamWm2: number
  /** Componente diffusa dal cielo sul piano dei pannelli, W/m². */
  diffuseWm2: number
  /** Componente riflessa dal suolo sul piano dei pannelli, W/m². */
  reflectedWm2: number
  /** Somma delle tre componenti, W/m². */
  globalWm2: number
  /** Angolo di incidenza dei raggi diretti, gradi. */
  aoiDeg: number
}

/**
 * Parametro N del modello di Muneer per superfici in ombra (sole dietro il pannello
 * o sotto l'orizzonte). Hofierka & Šúri 2002.
 */
const MUNEER_N_SHADED = 0.25227

/** sin 1° = 0,01745: limite inferiore di sin h nella diffusa (vedi sotto). */
const SIN_1_DEG = Math.sin(1 * DEG)

/**
 * Irradianza sul piano dei pannelli: somma di diretta, diffusa (Muneer) e riflessa.
 * Funzione pura: stessi ingressi → stessi risultati.
 */
export function planeOfArrayIrradiance(input: PoaInput): PoaIrradiance {
  const { dniWm2, dhiWm2, ghiWm2, sunZenithDeg, sunAzimuthDeg, extraterrestrialWm2, tiltDeg, panelAzimuthDeg } =
    input
  const albedo = input.albedo ?? DEFAULT_ALBEDO
  if (!(tiltDeg >= 0 && tiltDeg <= 90)) throw new RangeError('Inclinazione fuori da [0, 90]')
  if (!(albedo >= 0 && albedo <= 1)) throw new RangeError('Albedo fuori da [0, 1]')
  for (const [name, v] of [['DNI', dniWm2], ['DHI', dhiWm2], ['GHI', ghiWm2]] as const) {
    if (!(v >= 0)) throw new RangeError(`${name} deve essere un numero ≥ 0`)
  }

  const beta = tiltDeg * DEG
  const sunElevationRad = (90 - sunZenithDeg) * DEG
  const sunUp = sunElevationRad > 0
  const cosTheta = cosAngleOfIncidence(sunZenithDeg, sunAzimuthDeg, tiltDeg, panelAzimuthDeg)
  const aoiDeg = Math.acos(Math.min(1, Math.max(-1, cosTheta))) / DEG

  // 1. Diretta: DNI proiettata sul piano. Zero se il sole è sotto l'orizzonte o dietro il pannello.
  const beamWm2 = sunUp && cosTheta > 0 ? dniWm2 * cosTheta : 0

  // 2. Diffusa (Muneer, forma di r.sun).
  //    Kb = diretta orizzontale / extraterrestre orizzontale: quanto il cielo è sereno.
  //    F(β) = (1 + cos β)/2 + N · [sin β − β cos β − π sin²(β/2)]
  const beamHorizontal = sunUp ? dniWm2 * Math.sin(sunElevationRad) : 0
  const extraHorizontal = sunUp ? extraterrestrialWm2 * Math.sin(sunElevationRad) : 0
  // Kb limitato a [0, 1]: oltre 1 sarebbe fisicamente impossibile (succede solo per arrotondamenti).
  const kb = extraHorizontal > 0 ? Math.min(1, beamHorizontal / extraHorizontal) : 0
  const skyView = (1 + Math.cos(beta)) / 2
  const bracket = Math.sin(beta) - beta * Math.cos(beta) - Math.PI * Math.sin(beta / 2) ** 2

  let diffuseWm2: number
  if (!sunUp || cosTheta <= 0) {
    // Superficie in ombra: solo la parte isotropa e la luminosità dell'orizzonte.
    diffuseWm2 = dhiWm2 * (skyView + MUNEER_N_SHADED * bracket)
  } else {
    // Superficie al sole: N dipende da Kb (Hofierka & Šúri 2002).
    const n = 0.00263 - 0.712 * kb - 0.6883 * kb * kb
    const f = skyView + n * bracket
    // Componente circumsolare proporzionale a cos θ / sin h.
    //
    // Hofierka & Šúri descrivono un'espressione diversa per il sole sotto 0,1 rad (5,7°).
    // Confrontando ora per ora con le serie di PVGIS 5.3 (test di validazione, Roma 2020)
    // si vede che PVGIS NON la applica: con questa sola formula la diffusa annua coincide
    // entro lo 0,05 %, con l'altra no (scarti di ~10 W/m² in tutte le ore col sole a 4-5°).
    // Seguiamo quindi il comportamento misurato di PVGIS.
    //
    // sin h è limitato a sin 1° perché il rapporto non diverga col sole sull'orizzonte:
    // stessa soluzione della libreria pvlib per il rapporto analogo cos θ / cos z
    // (pvlib.irradiance.haydavies, limite 0,01745 = cos 89°). Nei dati PVGIS, sotto 1°
    // la diretta è sempre zero, quindi il limite non cambia i risultati di validazione.
    const sinH = Math.max(Math.sin(sunElevationRad), SIN_1_DEG)
    diffuseWm2 = dhiWm2 * (f * (1 - kb) + (kb * cosTheta) / sinH)
  }
  diffuseWm2 = Math.max(0, diffuseWm2)

  // 3. Riflessa dal suolo, isotropa (Duffie & Beckman, eq. 2.15.1).
  const reflectedWm2 = ghiWm2 * albedo * ((1 - Math.cos(beta)) / 2)

  return {
    beamWm2,
    diffuseWm2,
    reflectedWm2,
    globalWm2: beamWm2 + diffuseWm2 + reflectedWm2,
    aoiDeg,
  }
}
