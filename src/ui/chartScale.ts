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

/** Scala di riserva 0-1 (massimo non valido o non rappresentabile); nuova a ogni chiamata. */
const FALLBACK_SCALE = (): AxisScale => ({ top: 1, step: 1, ticks: [0, 1] })

/**
 * Sceglie il passo più piccolo del tipo {1, 2, 2,5, 5} × 10ⁿ che divide [0, max]
 * in al più `maxTicks` intervalli. Metodo classico ("nice numbers") descritto in
 * P. S. Heckbert, "Nice numbers for graph labels", Graphics Gems, 1990.
 */
export function niceScale(maxValue: number, maxTicks = 5): AxisScale {
  if (!(maxValue > 0) || !Number.isFinite(maxValue)) return FALLBACK_SCALE()
  const raw = maxValue / maxTicks
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const step = NICE_STEPS.map((m) => m * magnitude).find((s) => s >= raw) ?? 10 * magnitude
  // Valori estremi, non raggiungibili dall'interfaccia (issue #19); nessuna eccezione, che farebbe
  // scattare la barriera d'errore. Con un massimo denormale (es. 5e-324) la potenza di 10 va a 0 per
  // underflow e il passo vale 0: stessa scala di riserva dei massimi non validi.
  if (!(step > 0)) return FALLBACK_SCALE()
  // Vicino a Number.MAX_VALUE (~1,8e308) il passo o l'ultima tacca possono superare il massimo
  // rappresentabile e diventare Infinity: un solo intervallo da 0 al massimo, che è finito.
  const overflow = { top: maxValue, step: maxValue, ticks: [0, maxValue] }
  if (!Number.isFinite(step)) return overflow
  const intervals = Math.ceil(maxValue / step - 1e-9)
  const ticks = Array.from({ length: intervals + 1 }, (_, i) => Number((i * step).toPrecision(12)))
  const top = ticks[ticks.length - 1]
  if (!Number.isFinite(top)) return overflow
  return { top, step, ticks }
}
