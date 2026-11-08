/**
 * Asse verticale del grafico: tacche a valori "tondi".
 */

export interface AxisScale {
  /** Valore in cima all'asse (multiplo di `step`, ≥ del massimo dei dati). */
  top: number
  step: number
  /** Valori delle tacche, da 0 a `top`. */
  ticks: number[]
}

/** Moltiplicatori ammessi per il passo tra le tacche (× potenza di 10): 1, 2, 2,5, 5. */
const NICE_STEPS = [1, 2, 2.5, 5, 10]

/**
 * Sceglie il passo più piccolo del tipo {1, 2, 2,5, 5} × 10ⁿ che divide [0, max]
 * in al più `maxTicks` intervalli. Metodo classico ("nice numbers") descritto in
 * P. S. Heckbert, "Nice numbers for graph labels", Graphics Gems, 1990.
 */
export function niceScale(maxValue: number, maxTicks = 5): AxisScale {
  if (!(maxValue > 0) || !Number.isFinite(maxValue)) return { top: 1, step: 1, ticks: [0, 1] }
  const raw = maxValue / maxTicks
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const step = NICE_STEPS.map((m) => m * magnitude).find((s) => s >= raw) ?? 10 * magnitude
  const intervals = Math.ceil(maxValue / step - 1e-9)
  const ticks = Array.from({ length: intervals + 1 }, (_, i) => Number((i * step).toPrecision(12)))
  return { top: ticks[ticks.length - 1], step, ticks }
}
