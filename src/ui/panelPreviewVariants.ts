/**
 * Parametri delle due varianti dell'anteprima del pannello (PanelPreview.tsx), in un file a parte
 * perché i test li leggano senza che il file del componente esporti altro (Fast Refresh di Vite).
 */

import type { PanelProjectionOptions } from './panelProjection'

export interface PreviewVariant {
  readonly view: { readonly width: number; readonly height: number }
  readonly scene: PanelProjectionOptions & { readonly ox: number; readonly oy: number; readonly groundRadiusM: number }
  /** Passo delle tacche sul bordo del disco (gradi). */
  readonly tickStepDeg: number
  /** Distanza delle lettere N/E/S/O dal centro, in raggi del disco: [Nord, altri]. */
  readonly letterRadii: readonly [number, number]
  /** Anello interno, assi del disco e riquadro di profilo quotato. */
  readonly technical: boolean
}

/** Valori della variante "b" dal prototipo (docs/prototypes/look-b, `drawScene`). */
export const PREVIEW_VARIANTS: Readonly<Record<'a' | 'b', PreviewVariant>> = {
  a: {
    view: { width: 460, height: 300 },
    scene: { ox: 272, oy: 172, scale: 67, elevationDeg: 26, yawDeg: 20, groundRadiusM: 2 },
    tickStepDeg: 5,
    letterRadii: [1.35, 1.35], // R + 0,7 m con R = 2 m, come prima
    technical: true,
  },
  b: {
    view: { width: 640, height: 392 },
    scene: { ox: 320, oy: 198, scale: 100, elevationDeg: 40, yawDeg: 20, distanceM: 10, groundRadiusM: 2, clearanceM: 0.3 },
    tickStepDeg: 45,
    letterRadii: [1.62, 1.3],
    technical: false,
  },
}

