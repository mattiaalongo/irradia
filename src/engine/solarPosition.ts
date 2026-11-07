/**
 * Posizione del sole nel cielo per un istante e un luogo.
 *
 * Algoritmo NOAA (Solar Calculator), basato su J. Meeus,
 * "Astronomical Algorithms" (2ª ed., 1998).
 * Errore tipico < 0,01° tra le latitudini ±72° e per gli anni 1800-2100.
 *
 * Convenzioni (valide per tutto il motore di calcolo):
 * - tutti gli angoli in input e output sono in GRADI;
 * - latitudine positiva a Nord, longitudine positiva a Est;
 * - azimut misurato da Nord in senso orario: 0 = N, 90 = E, 180 = S, 270 = O;
 * - l'istante è un `Date` (rappresenta sempre un momento assoluto in UTC).
 */

export interface SolarPosition {
  /** Elevazione geometrica (senza rifrazione) sull'orizzonte, gradi. Negativa di notte. */
  elevation: number
  /** Elevazione apparente: geometrica + correzione per la rifrazione atmosferica, gradi. */
  apparentElevation: number
  /** Angolo zenitale geometrico = 90° − elevazione, gradi. */
  zenith: number
  /** Azimut da Nord in senso orario, gradi in [0, 360). */
  azimuth: number
  /** Declinazione solare, gradi. */
  declination: number
  /** Equazione del tempo, MINUTI (tempo solare vero − tempo solare medio). */
  equationOfTime: number
  /** Angolo orario, gradi: 0 a mezzogiorno solare, negativo al mattino. */
  hourAngle: number
}

const DEG = Math.PI / 180
const sinD = (x: number) => Math.sin(x * DEG)
const cosD = (x: number) => Math.cos(x * DEG)
const tanD = (x: number) => Math.tan(x * DEG)

/** Riporta un angolo in [0, 360). */
const normalize360 = (x: number) => ((x % 360) + 360) % 360

/** Giorno giuliano dall'istante (il 1/1/1970 00:00 UTC è JD 2440587,5). */
export function julianDay(date: Date): number {
  return date.getTime() / 86_400_000 + 2_440_587.5
}

/**
 * Correzione della rifrazione atmosferica (gradi) in funzione dell'elevazione
 * geometrica, per condizioni standard (1010 hPa, 10 °C). Formula NOAA.
 */
export function atmosphericRefraction(elevation: number): number {
  if (elevation > 85) return 0
  const t = tanD(elevation)
  let arcsec: number
  if (elevation > 5) {
    arcsec = 58.1 / t - 0.07 / t ** 3 + 0.000086 / t ** 5
  } else if (elevation > -0.575) {
    const e = elevation
    arcsec = 1735 + e * (-518.2 + e * (103.4 + e * (-12.79 + e * 0.711)))
  } else {
    arcsec = -20.772 / t
  }
  return arcsec / 3600
}

export function solarPosition(date: Date, latitude: number, longitude: number): SolarPosition {
  if (!Number.isFinite(date.getTime())) throw new RangeError('Data non valida')
  if (!(latitude >= -90 && latitude <= 90)) throw new RangeError('Latitudine fuori da [-90, 90]')
  if (!(longitude >= -180 && longitude <= 180)) throw new RangeError('Longitudine fuori da [-180, 180]')

  // Secoli giuliani dall'epoca J2000.0
  const T = (julianDay(date) - 2_451_545) / 36_525

  // Longitudine media e anomalia media del sole, eccentricità dell'orbita terrestre
  const L0 = normalize360(280.46646 + T * (36000.76983 + T * 0.0003032))
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T)
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T)

  // Equazione del centro → longitudine vera → longitudine apparente (nutazione e aberrazione)
  const C =
    sinD(M) * (1.914602 - T * (0.004817 + 0.000014 * T)) +
    sinD(2 * M) * (0.019993 - 0.000101 * T) +
    sinD(3 * M) * 0.000289
  const trueLongitude = L0 + C
  const omega = 125.04 - 1934.136 * T
  const apparentLongitude = trueLongitude - 0.00569 - 0.00478 * sinD(omega)

  // Obliquità dell'eclittica (media e corretta)
  const meanObliquity = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60
  const obliquity = meanObliquity + 0.00256 * cosD(omega)

  const declination = Math.asin(sinD(obliquity) * sinD(apparentLongitude)) / DEG

  // Equazione del tempo (minuti)
  const y = tanD(obliquity / 2) ** 2
  const equationOfTime =
    (4 / DEG) *
    (y * sinD(2 * L0) -
      2 * e * sinD(M) +
      4 * e * y * sinD(M) * cosD(2 * L0) -
      0.5 * y * y * sinD(4 * L0) -
      1.25 * e * e * sinD(2 * M))

  // Tempo solare vero (minuti dalla mezzanotte solare) e angolo orario
  const msOfDayUtc = ((date.getTime() % 86_400_000) + 86_400_000) % 86_400_000
  const minutesUtc = msOfDayUtc / 60_000
  const trueSolarTime = (((minutesUtc + equationOfTime + 4 * longitude) % 1440) + 1440) % 1440
  const hourAngle = trueSolarTime / 4 - 180

  // Angolo zenitale (coseno limitato a [-1, 1] per evitare NaN da arrotondamenti)
  const cosZenith =
    sinD(latitude) * sinD(declination) + cosD(latitude) * cosD(declination) * cosD(hourAngle)
  const zenith = Math.acos(Math.min(1, Math.max(-1, cosZenith))) / DEG
  const elevation = 90 - zenith

  // Azimut da Nord in senso orario. atan2 evita divisioni per zero ai poli e allo zenit.
  const azimuth = normalize360(
    180 +
      Math.atan2(
        sinD(hourAngle),
        cosD(hourAngle) * sinD(latitude) - tanD(declination) * cosD(latitude),
      ) /
        DEG,
  )

  return {
    elevation,
    apparentElevation: elevation + atmosphericRefraction(elevation),
    zenith,
    azimuth,
    declination,
    equationOfTime,
    hourAngle,
  }
}
