import { LOOK_LABELS, LOOK_SWITCH_LEGEND, type Look } from './look'

/** Nome del gruppo di radio: c'è un solo interruttore nella pagina, un nome fisso basta (niente hook). */
const RADIO_NAME = 'irradia-look'

/**
 * Interruttore dell'aspetto della pagina: `<fieldset>` con `<legend>` e due radio NATIVI.
 * Radio nativi: tastiera (frecce), lettori di schermo e telefoni funzionano senza codice nostro;
 * il gruppo ha nome dalla legenda. Nessun `aria-live`: il cambio si vede, e chi usa un lettore di
 * schermo sente già "selezionato" sul radio.
 *
 * Il componente sta nello stesso punto dell'albero React in entrambi gli aspetti (nell'intestazione,
 * vedi App.tsx): non viene rimontato e il radio scelto resta a fuoco dopo il cambio.
 */
export default function LookSwitch({ look, onChange }: { look: Look; onChange: (look: Look) => void }) {
  return (
    <fieldset className="look-switch">
      <legend>{LOOK_SWITCH_LEGEND}</legend>
      <div className="look-options">
        {(['a', 'b'] as const).map((value) => (
          <label key={value} className="look-option">
            <input
              type="radio"
              name={RADIO_NAME}
              value={value}
              checked={look === value}
              onChange={() => onChange(value)}
            />
            {LOOK_LABELS[value]}
          </label>
        ))}
      </div>
    </fieldset>
  )
}
