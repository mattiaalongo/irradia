import {
  DIFFERENCES_LABEL, DIFFERENCES_PARAGRAPHS, EXCLUDED_LABEL, INCLUDED_LABEL, METHOD_INTRO, METHOD_SUMMARY,
  excludedItems, includedItems,
} from './methodNote'

interface Props {
  usesHorizon: boolean
  yearMin: number
  yearMax: number
}

/** Sezione richiudibile (chiusa per default) che spiega come è calcolata la stima. Testi in methodNote.ts. */
export default function EstimateMethod({ usesHorizon, yearMin, yearMax }: Props) {
  return (
    <details className="method">
      <summary>{METHOD_SUMMARY}</summary>
      <div className="method-body">
        <p>{METHOD_INTRO}</p>
        <p><strong>{INCLUDED_LABEL}</strong></p>
        <ul>
          {includedItems(usesHorizon, yearMin, yearMax).map((t) => <li key={t}>{t}</li>)}
        </ul>
        <p><strong>{EXCLUDED_LABEL}</strong></p>
        <ul>
          {excludedItems(usesHorizon).map((t) => <li key={t}>{t}</li>)}
        </ul>
        <p><strong>{DIFFERENCES_LABEL}</strong></p>
        {DIFFERENCES_PARAGRAPHS.map((t) => <p key={t}>{t}</p>)}
      </div>
    </details>
  )
}
