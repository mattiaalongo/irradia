/**
 * Comportamento elettrico e termico di un modulo fotovoltaico in silicio cristallino.
 *
 * Sono gli stessi modelli che PVGIS 5.3 dichiara di usare
 * (JRC, "PVGIS data sources & calculation methods",
 * https://joint-research-centre.ec.europa.eu/photovoltaic-geographical-information-system-pvgis/getting-started-pvgis/pvgis-data-sources-calculation-methods_en):
 * 1. perdite per riflessione sul vetro in funzione dell'angolo di incidenza: Martin & Ruiz;
 * 2. temperatura del modulo: Faiman;
 * 3. rendimento in funzione di irradianza e temperatura: Huld et al. (2011).
 */

const DEG = Math.PI / 180

// ───────────────────────── 1. Riflessione sul vetro (Martin & Ruiz) ─────────────────────────

/**
 * Coefficiente a_r del modello di Martin & Ruiz per moduli in silicio cristallino
 * con vetro normale. Fonte: N. Martin, J. M. Ruiz, "Calculation of the PV modules angular
 * losses under field conditions by means of an analytical model", Solar Energy
 * Materials & Solar Cells 70 (2001), pp. 25-38 (valore per vetro normale); è anche il valore di PVGIS.
 */
export const MARTIN_RUIZ_AR_CSI = 0.16

/**
 * Frazione della luce DIRETTA che entra nel modulo (il resto viene riflesso dal vetro),
 * rispetto all'incidenza perpendicolare. Martin & Ruiz 2001:
 *   F = 1 − [exp(−cos θ / a_r) − exp(−1 / a_r)] / [1 − exp(−1 / a_r)]
 * Vale 1 per θ = 0 e 0 per θ ≥ 90°.
 */
export function martinRuizBeamFactor(aoiDeg: number, ar = MARTIN_RUIZ_AR_CSI): number {
  if (aoiDeg >= 90) return 0
  const c = Math.cos(Math.max(0, aoiDeg) * DEG)
  return 1 - (Math.exp(-c / ar) - Math.exp(-1 / ar)) / (1 - Math.exp(-1 / ar))
}

/**
 * Formula approssimata di Martin & Ruiz 2001 per la luce che arriva da molte
 * direzioni (diffusa e riflessa): F = 1 − exp[−(c1·x + c2·x²) / a_r],
 * con c1 = 4/(3π) e c2 = 0,5·a_r − 0,154.
 */
function martinRuizIsotropicFactor(x: number, ar: number): number {
  const c1 = 4 / (3 * Math.PI)
  const c2 = 0.5 * ar - 0.154
  return 1 - Math.exp(-(c1 * x + c2 * x * x) / ar)
}

/** Frazione della luce DIFFUSA dal cielo che entra nel modulo. Martin & Ruiz 2001. */
export function martinRuizDiffuseFactor(tiltDeg: number, ar = MARTIN_RUIZ_AR_CSI): number {
  const b = tiltDeg * DEG
  return martinRuizIsotropicFactor(Math.sin(b) + (Math.PI - b - Math.sin(b)) / (1 + Math.cos(b)), ar)
}

/** Frazione della luce RIFLESSA dal suolo che entra nel modulo. Martin & Ruiz 2001. */
export function martinRuizGroundFactor(tiltDeg: number, ar = MARTIN_RUIZ_AR_CSI): number {
  const b = tiltDeg * DEG
  // Per β → 0 il termine (β − sin β)/(1 − cos β) tende a 0 (≈ β/3): evitiamo 0/0.
  // Un pannello piatto non vede il suolo, quindi il valore non viene comunque usato.
  const x = b < 1e-6 ? Math.sin(b) : Math.sin(b) + (b - Math.sin(b)) / (1 - Math.cos(b))
  return martinRuizIsotropicFactor(x, ar)
}

// ───────────────────────── 2. Temperatura del modulo (Faiman) ─────────────────────────

/** Coefficienti di scambio termico del modello di Faiman. */
export interface FaimanCoefficients {
  /** Parte costante, W/(m²·K). */
  u0: number
  /** Parte proporzionale al vento, W/(m³·s·K). */
  u1: number
}

/**
 * Valori dichiarati da PVGIS per moduli c-Si montati "liberi" (aria che circola dietro),
 * con il vento a 10 m dei dati meteo (doc. PVGIS citata in testa al file; T. Huld,
 * A. M. Gracia Amillo, Energies 8 (2015), pp. 5159-5181).
 * Verifica (8/11/2026): il sito del JRC non era raggiungibile dall'ambiente di sviluppo;
 * i valori sono confermati indirettamente dai test, che riproducono la potenza oraria di
 * PVGIS entro l'1 % circa. I valori originali di Faiman (25 e 6,84, fit su 7 moduli)
 * darebbero un risultato quasi uguale (−0,2 % sull'anno): i dati non bastano a distinguerli.
 */
export const FAIMAN_FREE_STANDING_CSI: FaimanCoefficients = { u0: 26.9, u1: 6.2 }

/**
 * Temperatura del modulo, °C. Modello di Faiman: D. Faiman, "Assessing the outdoor
 * operating temperature of photovoltaic modules", Progress in Photovoltaics 16 (2008),
 * pp. 307-315:
 *   Tm = Ta + G / (U0 + U1 · v)
 * G è l'irradianza sul piano dei moduli come la misura un piranometro (quindi PRIMA
 * delle perdite per riflessione del vetro del modulo): così è stato tarato il modello.
 */
export function faimanModuleTemperature(
  airTemperatureC: number,
  poaGlobalWm2: number,
  windSpeedMs: number,
  coefficients: FaimanCoefficients = FAIMAN_FREE_STANDING_CSI,
): number {
  if (!(windSpeedMs >= 0)) throw new RangeError('Velocità del vento deve essere ≥ 0')
  return airTemperatureC + poaGlobalWm2 / (coefficients.u0 + coefficients.u1 * windSpeedMs)
}

// ───────────────────────── 3. Rendimento (Huld 2011) ─────────────────────────

/** Coefficienti k1…k6 del modello di Huld (adimensionali, relativi alla potenza nominale). */
export type HuldCoefficients = readonly [number, number, number, number, number, number]

/**
 * Coefficienti per silicio cristallino usati da PVGIS 5.
 * Fonte: T. Huld et al., "A power-rating model for crystalline silicon PV modules",
 * Solar Energy Materials & Solar Cells 95 (2011), pp. 3359-3369; gli stessi valori sono
 * nella libreria pvlib (funzione `pvarray.huld`, k_version "pvgis5").
 * PVGIS 6 usa coefficienti aggiornati (Chatzipanagi et al., Prog. Photovolt. 33, 2025):
 * qui restiamo su PVGIS 5.3, che è la versione con cui validiamo.
 */
export const HULD_CSI_PVGIS5: HuldCoefficients = [-0.017237, -0.040465, -0.004702, 0.000149, 0.00017, 0.000005]

/** Condizioni standard di prova (STC): 1000 W/m², 25 °C. Norma IEC 61215 / IEC 60904-3. */
export const STC_IRRADIANCE_WM2 = 1000
export const STC_TEMPERATURE_C = 25

/**
 * Rendimento relativo del modulo rispetto alle condizioni STC (1 = come in targa).
 * Huld et al. 2011, con G′ = G/1000 e T′ = Tm − 25:
 *   η_rel = 1 + k1 ln G′ + k2 (ln G′)² + T′ (k3 + k4 ln G′ + k5 (ln G′)²) + k6 T′²
 * G è l'irradianza che entra davvero nel modulo (dopo le perdite per riflessione).
 * Restituisce 0 senza luce. A irradianze bassissime la formula può diventare negativa:
 * la limitiamo a 0 perché un modulo non assorbe potenza.
 */
export function huldRelativeEfficiency(
  effectiveIrradianceWm2: number,
  moduleTemperatureC: number,
  k: HuldCoefficients = HULD_CSI_PVGIS5,
): number {
  if (!(effectiveIrradianceWm2 > 0)) return 0
  const lnG = Math.log(effectiveIrradianceWm2 / STC_IRRADIANCE_WM2)
  const t = moduleTemperatureC - STC_TEMPERATURE_C
  const eta = 1 + k[0] * lnG + k[1] * lnG ** 2 + t * (k[2] + k[3] * lnG + k[4] * lnG ** 2) + k[5] * t ** 2
  return Math.max(0, eta)
}

/**
 * Potenza in corrente continua di un generatore di potenza nominale `peakPowerW`
 * (somma delle potenze di targa dei moduli), W. Huld et al. 2011:
 *   P = P_STC · (G / 1000) · η_rel
 */
export function huldDcPower(
  peakPowerW: number,
  effectiveIrradianceWm2: number,
  moduleTemperatureC: number,
  k: HuldCoefficients = HULD_CSI_PVGIS5,
): number {
  if (!(peakPowerW >= 0)) throw new RangeError('Potenza nominale deve essere ≥ 0')
  return (
    peakPowerW *
    (Math.max(0, effectiveIrradianceWm2) / STC_IRRADIANCE_WM2) *
    huldRelativeEfficiency(effectiveIrradianceWm2, moduleTemperatureC, k)
  )
}
