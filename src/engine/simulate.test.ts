import { describe, expect, it } from 'vitest'
import romaHorizRaw from './__fixtures__/pvgis-series-roma-2020-horiz.json'
import romaS35Raw from './__fixtures__/pvgis-series-roma-2020-s35.json'
import romaE20Raw from './__fixtures__/pvgis-series-roma-2020-e20.json'
import romaTmyRaw from './__fixtures__/pvgis-tmy-roma.json'
import romaPvcalcRaw from './__fixtures__/pvgis-pvcalc-roma-s35.json'
import romaMrcalcRaw from './__fixtures__/pvgis-mrcalc-roma-s35.json'
import milanoHorizRaw from './__fixtures__/pvgis-series-milano-2020-horiz.json'
import milanoS35Raw from './__fixtures__/pvgis-series-milano-2020-s35.json'
import milanoTmyRaw from './__fixtures__/pvgis-tmy-milano.json'
import milanoPvcalcRaw from './__fixtures__/pvgis-pvcalc-milano-s35.json'
import milanoMrcalcRaw from './__fixtures__/pvgis-mrcalc-milano-s35.json'
import livornoTmyRaw from './__fixtures__/pvgis-tmy-livorno.json'
import aostaTmyRaw from './__fixtures__/pvgis-tmy-aosta.json'
import aostaTmyNoHorizonRaw from './__fixtures__/pvgis-tmy-aosta-nohorizon.json'
import aostaHorizonRaw from './__fixtures__/pvgis-horizon-aosta.json'
import aostaMrcalcRaw from './__fixtures__/pvgis-mrcalc-aosta-s35.json'
import aostaMrcalcNoHorizonRaw from './__fixtures__/pvgis-mrcalc-aosta-s35-nohorizon.json'
import { parsePvgisHorizon } from './__fixtures__/pvgisHorizon'
import { parsePvgisSeries, type Series } from './__fixtures__/pvgisSeries'
import { parsePvgisMonthly, type MonthlyRadiation } from './__fixtures__/pvgisMonthly'
import { parsePvgisTmy, TMY_HOURS, type Tmy } from './pvgisTmy'
import { simulateHour, simulateYear, type PvSystem } from './simulate'
import { solarPosition } from './solarPosition'

// Dati reali di PVGIS 5.3 (banche dati PVGIS-SARAH3 ed ERA5): origine, comandi e hash in
// __fixtures__/README.md. Serie orarie, MRcalc e PVcalc di Roma e Milano sono senza ombre
// dell'orizzonte (usehorizon=0); gli anni tipo invece le hanno (valore predefinito di PVGIS, lo
// stesso che l'app chiede con usehorizon=1). A Milano non cambia nulla; a Roma l'orizzonte toglie
// la diretta in 66 ore al tramonto: −0,07 % a Sud 35°, uno scarto noto e molto dentro le
// tolleranze qui sotto (issue #25). Aosta, in fondo, ha i dati con e senza orizzonte. Strumenti usati:
// - seriescalc (anno 2020 ora per ora): isola ogni formula del modello;
// - tmy (anno tipo): è ciò che l'app scarica e simula;
// - MRcalc (irradiazione di ogni mese 2005-2023): il mese REALE da cui viene ogni mese del TMY;
// - PVcalc (media 2005-2023 di energia, irradiazione e perdite).

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
const relDiff = (ours: number, ref: number) => ours / ref - 1

/** 4 pannelli da 250 W = 1 kWp, come le serie orarie di PVGIS (peakpower=1, loss=14). */
const oneKwp = (tiltDeg: number, azimuthDeg: number): PvSystem => ({
  tiltDeg,
  azimuthDeg,
  panelCount: 4,
  panelPowerWp: 250,
  systemLossPct: 14,
})

interface Site {
  name: string
  lat: number
  lon: number
  horiz: Series
  tmy: Tmy
  mrcalc: MonthlyRadiation
  pvcalc: typeof romaPvcalcRaw
  /** Impianto uguale a quello chiesto a PVcalc (stessi kWp e perdite, Sud 35°). */
  pvcalcSystem: PvSystem
}

const roma: Site = {
  name: 'Roma',
  lat: 41.9028,
  lon: 12.4964,
  horiz: parsePvgisSeries(romaHorizRaw),
  tmy: parsePvgisTmy(romaTmyRaw),
  mrcalc: parsePvgisMonthly(romaMrcalcRaw),
  pvcalc: romaPvcalcRaw,
  pvcalcSystem: oneKwp(35, 180), // PVcalc peakpower=1, loss=14
}

const milano: Site = {
  name: 'Milano',
  lat: 45.4642,
  lon: 9.19,
  horiz: parsePvgisSeries(milanoHorizRaw),
  tmy: parsePvgisTmy(milanoTmyRaw),
  mrcalc: parsePvgisMonthly(milanoMrcalcRaw),
  pvcalc: milanoPvcalcRaw,
  // PVcalc peakpower=8.6, loss=0: l'impianto del caso segnalato nell'issue #10 (20 × 430 W).
  pvcalcSystem: { tiltDeg: 35, azimuthDeg: 180, panelCount: 20, panelPowerWp: 430, systemLossPct: 0 },
}

/** Anno tipo di Roma: usato dai test di proprietà generali in fondo al file. */
const tmy = roma.tmy

/**
 * Rifà ora per ora il calcolo di PVGIS partendo dalle stesse componenti orizzontali
 * (serie con angle=0) e restituisce, per ogni ora, i nostri valori e quelli di PVGIS.
 */
function compareHourly(site: Site, tilted: Series) {
  const { horiz, lat, lon } = site
  expect(tilted.hours).toHaveLength(horiz.hours.length)
  const system = oneKwp(tilted.tiltDeg, tilted.azimuthDeg)
  return horiz.hours.map((h, i) => {
    const pvgis = tilted.hours[i]
    // Stesso istante nelle due serie (PVGIS lo dà già con il ritardo di ~10 minuti).
    expect(pvgis.time.getTime()).toBe(h.time.getTime())
    // PVGIS dà la diretta sul piano orizzontale: la riportiamo a DNI con il NOSTRO zenit.
    const cosZ = Math.cos((solarPosition(h.time, lat, lon).zenith * Math.PI) / 180)
    const ours = simulateHour(
      {
        time: h.time,
        ghiWm2: h.beamWm2 + h.diffuseWm2,
        dniWm2: cosZ > 0 ? h.beamWm2 / cosZ : 0,
        dhiWm2: h.diffuseWm2,
        airTemperatureC: h.airTemperatureC,
        windSpeedMs: h.windSpeedMs,
      },
      lat,
      lon,
      system,
    )
    return { ours, pvgis }
  })
}

// Tolleranze sulle somme annue di diretta, diffusa ed energia, uguali per tutti i casi.
// Misurate l'8/11/2026 (Roma Sud / Roma Est / Milano Sud): diretta +0,15/+0,13/+0,15 %,
// diffusa +0,04/0,00/+0,08 %, energia +0,60/+0,32/+0,42 %. Diretta e diffusa: margine
// circa 2× (un cambiamento del modello che sposti il risultato anche di pochi decimi di
// punto fa fallire il test). Energia ±1 %: il residuo è l'effetto spettrale, che PVGIS
// calcola e noi no; pesa circa ±1 % e cambia segno con le condizioni del cielo.
describe.each([
  // Sud 35°: il caso più comune su un tetto italiano. Riflessa misurata +0,03 %.
  { site: roma, name: 'Sud, 35°', raw: romaS35Raw, tilt: 35, azimuth: 180, reflectedTol: 0.002 },
  // Est 20°: controlla anche la conversione dell'orientamento (aspect −90 → azimut 90).
  // Riflessa: PVGIS, quando il sole è dietro il pannello, la calcola con la sola diffusa
  // (come se anche il suolo fosse in ombra): sono ~0,18 kWh/m² l'anno su un pannello
  // rivolto a Est. Noi teniamo il modello fisico (suolo illuminato da GHI): +1,7 %.
  { site: roma, name: 'Est, 20°', raw: romaE20Raw, tilt: 20, azimuth: 90, reflectedTol: 0.02 },
  // Milano, Sud 35°: seconda località, più a Nord e con più diffusa. Riflessa misurata
  // +0,22 % (stessa causa dell'Est 20°: alba e tramonto d'estate con il sole dietro il
  // pannello pesano di più alle latitudini alte); tolleranza ±0,3 %.
  { site: milano, name: 'Sud, 35°', raw: milanoS35Raw, tilt: 35, azimuth: 180, reflectedTol: 0.003 },
])('validazione ora per ora contro PVGIS seriescalc 2020, $site.name — $name', ({ site, raw, tilt, azimuth, reflectedTol }) => {
  const tilted = parsePvgisSeries(raw)
  const rows = compareHourly(site, tilted)

  it('il file PVGIS ha l\'orientamento atteso (conversione aspect → azimut)', () => {
    expect(tilted.tiltDeg).toBe(tilt)
    expect(tilted.azimuthDeg).toBe(azimuth)
    expect(tilted.peakPowerKwp).toBe(1)
    expect(tilted.systemLossPct).toBe(14)
  })

  it('diretta annua sul piano entro ±0,3 %', () => {
    const d = relDiff(sum(rows.map((r) => r.ours.poaBeamWm2)), sum(rows.map((r) => r.pvgis.beamWm2)))
    expect(Math.abs(d)).toBeLessThan(0.003)
  })

  it('diffusa annua sul piano (Muneer) entro ±0,2 %', () => {
    const d = relDiff(sum(rows.map((r) => r.ours.poaDiffuseWm2)), sum(rows.map((r) => r.pvgis.diffuseWm2)))
    expect(Math.abs(d)).toBeLessThan(0.002)
  })

  it('riflessa annua entro la tolleranza motivata sopra', () => {
    const d = relDiff(sum(rows.map((r) => r.ours.poaReflectedWm2)), sum(rows.map((r) => r.pvgis.reflectedWm2)))
    expect(Math.abs(d)).toBeLessThan(reflectedTol)
  })

  it('energia annua entro ±1 %', () => {
    const d = relDiff(sum(rows.map((r) => r.ours.acPowerW)), sum(rows.map((r) => r.pvgis.powerW!)))
    expect(Math.abs(d)).toBeLessThan(0.01)
  })

  // Singole ore con molta luce (> 200 W/m² o > 200 W). Massimi misurati (Roma Sud / Milano
  // Sud): diretta 1,7/2,0 %, diffusa 0,56/0,65 %, potenza 1,9/2,3 %; Roma Est fino a 2,7 %.
  // Le differenze orarie nascono soprattutto dall'altezza del sole: quella di PVGIS
  // differisce dalla nostra fino a 0,4° (la nostra è l'algoritmo NOAA, verificato in
  // solarPosition.test.ts entro 0,01°), e dall'effetto spettrale.
  it('ore soleggiate: diretta ±3 %, diffusa ±1 %, potenza ±3 %', () => {
    for (const { ours, pvgis } of rows) {
      if (pvgis.beamWm2 > 200) expect(Math.abs(relDiff(ours.poaBeamWm2, pvgis.beamWm2))).toBeLessThan(0.03)
      if (pvgis.diffuseWm2 > 200) expect(Math.abs(relDiff(ours.poaDiffuseWm2, pvgis.diffuseWm2))).toBeLessThan(0.01)
      if (pvgis.powerW! > 200) expect(Math.abs(relDiff(ours.acPowerW, pvgis.powerW!))).toBeLessThan(0.03)
    }
  })
})

/*
 * Anno tipo contro PVGIS. PVcalc dà la MEDIA 2005-2023; l'anno tipo è fatto di 12 mesi
 * reali, ciascuno preso da un anno diverso. Il confronto diretto "energia dell'anno tipo
 * contro media" mescola due cose: quanta luce c'è stata in quei 12 mesi (la "fortuna"
 * dell'anno tipo, che non dipende dal nostro motore) e quanta energia il nostro motore
 * ricava da quella luce. A Milano, per esempio, l'anno tipo ha il 3,9 % di luce sul piano
 * in più della media e l'energia risulta +3,5 % rispetto a PVcalc con il motore corretto;
 * settembre (2018) è a 2,03 deviazioni standard dalla media pur essendo un mese reale.
 * Per questo i controlli sono separati:
 *   1. luce: ogni mese dell'anno tipo contro LO STESSO mese reale di MRcalc;
 *   2. conversione luce → energia: rapporto E/H(i) contro quello di PVcalc;
 *   3. energia corretta per la fortuna dell'anno tipo (che MRcalc misura da solo).
 * Nessuno di questi può fallire perché l'anno tipo è stato più o meno soleggiato.
 */
describe.each([roma, milano])('anno tipo di $name contro PVGIS (Sud 35°, MRcalc e PVcalc)', (site) => {
  const { tmy: siteTmy, mrcalc, pvcalc } = site
  const system = site.pvcalcSystem
  const pv = pvcalc.outputs.totals.fixed
  const year = simulateYear(siteTmy, system)

  // Mese per mese: irradiazione sul piano (nostra), GHI del TMY, e perdite (come PVGIS).
  const offsetMs = siteTmy.irradianceTimeOffsetH * 3_600_000
  const poaKwhM2 = new Array<number>(12).fill(0)
  const ghiKwhM2 = new Array<number>(12).fill(0)
  let poaWh = 0
  let effWh = 0
  let dcWh = 0
  for (const h of siteTmy.hours) {
    // Stesso istante usato da simulateYear (irradianze riferite a time + offset).
    const r = simulateHour({ ...h, time: new Date(h.time.getTime() + offsetMs) }, siteTmy.latitude, siteTmy.longitude, system)
    const m = h.time.getUTCMonth() // stesso criterio dei mesi di simulateYear
    poaKwhM2[m] += r.poaGlobalWm2 / 1000
    ghiKwhM2[m] += h.ghiWm2 / 1000
    poaWh += r.poaGlobalWm2
    effWh += r.effectiveIrradianceWm2
    dcWh += r.dcPowerW
  }
  // Mese reale (anno, mese) da cui il TMY ha preso ciascun mese, in ordine gennaio → dicembre.
  const sources = Array.from({ length: 12 }, (_, i) => {
    const sel = siteTmy.monthsSelected.find((s) => s.month === i + 1)
    if (!sel) throw new Error(`Il TMY di ${site.name} non indica l'anno del mese ${i + 1}`)
    return mrcalc.get(sel.year, sel.month)
  })
  const sourceHi = sum(sources.map((s) => s.inclinedKwhM2))
  /** Quanta luce in più (o in meno) della media hanno i 12 mesi dell'anno tipo, secondo MRcalc. */
  const luck = sourceHi / pv['H(i)_y']

  it('i dati PVGIS descrivono lo stesso impianto e lo stesso piano (Sud 35°, senza orizzonte)', () => {
    expect(siteTmy.latitude).toBeCloseTo(site.lat, 3)
    expect(siteTmy.longitude).toBeCloseTo(site.lon, 3)
    expect(mrcalc.tiltDeg).toBe(35)
    expect(mrcalc.azimuthDeg).toBe(180)
    expect(mrcalc.usesHorizon).toBe(false)
    expect(pvcalc.inputs.mounting_system.fixed.slope.value).toBe(35)
    expect(pvcalc.inputs.mounting_system.fixed.azimuth.value).toBe(0) // aspect 0 = Sud
    expect(pvcalc.inputs.meteo_data.use_horizon).toBe(false)
    expect(pvcalc.inputs.pv_module.peak_power).toBe(year.peakPowerKwp)
    expect(pvcalc.inputs.pv_module.system_loss).toBe(system.systemLossPct)
    // Ogni mese del TMY viene da un anno della banca dati (altrimenti mrcalc.get fallisce).
    expect(sources.map((s) => s.month)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
  })

  // Il TMY e MRcalc vengono dalla stessa banca dati (SARAH3): la GHI di ogni mese del TMY è
  // H(h)_m di MRcalc per quell'anno. Questo verifica che ogni ora sia attribuita al mese
  // giusto (mese UTC). Massimo misurato: +0,16 % Roma, +0,25 % Milano (arrotondamenti dei
  // valori orari del TMY a 0,01 W/m² e del mensile a 0,01 kWh/m²). Tolleranza ±0,5 %.
  it('GHI di ogni mese del TMY entro ±0,5 % di H(h)_m MRcalc dello stesso anno', () => {
    sources.forEach((src, i) => {
      expect(Math.abs(relDiff(ghiKwhM2[i], src.horizontalKwhM2))).toBeLessThan(0.005)
    })
  })

  // Nostra trasposizione sul piano contro quella di PVGIS, mese per mese sul mese reale.
  // Massimo misurato: Roma +0,67 % (ottobre 2012), −0,51 % (dicembre 2020); Milano +0,32 %
  // (dicembre 2013). Le differenze mensili nascono dalle stesse cause della validazione
  // oraria (altezza del sole, riflessa col sole dietro il pannello): tolleranza ±1 %.
  it('irradiazione sul piano di ogni mese entro ±1 % di H(i)_m MRcalc dello stesso anno', () => {
    sources.forEach((src, i) => {
      expect(Math.abs(relDiff(poaKwhM2[i], src.inclinedKwhM2))).toBeLessThan(0.01)
    })
  })

  // Somma dei 12 mesi: gli scarti mensili si compensano. Misurato −0,02 % Roma, +0,09 %
  // Milano. Tolleranza ±0,5 %: un errore sistematico di trasposizione la supererebbe.
  it('irradiazione annua sul piano entro ±0,5 % della somma dei 12 mesi reali di MRcalc', () => {
    expect(year.annualPoaKwhM2).toBeCloseTo(sum(poaKwhM2), 6)
    expect(Math.abs(relDiff(year.annualPoaKwhM2, sourceHi))).toBeLessThan(0.005)
  })

  // Conversione luce → energia: kWh prodotti per kWh/m² ricevuto, nostro contro PVcalc.
  // Misurato −0,46 % Roma, −0,52 % Milano. Cause note: l'effetto spettrale, che PVGIS
  // calcola e noi no (PVcalc l_spec +1,03 % Roma, +1,16 % Milano), e le temperature dei
  // 12 mesi dell'anno tipo, diverse dalla media dei 19 anni usata da PVcalc.
  // Tolleranza ±1,5 %: copre lo spettrale con margine, non un errore di modello di qualche %.
  it('kWh per kWh/m² entro ±1,5 % di PVcalc (E_y / H(i)_y)', () => {
    const ours = year.annualKwh / year.annualPoaKwhM2
    const ref = pv.E_y / pv['H(i)_y']
    expect(Math.abs(relDiff(ours, ref))).toBeLessThan(0.015)
  })

  // Perdite annue per tipo, definite come in PVGIS (l_aoi e l_tg, in catena).
  // Misurato: riflessione −2,78 % Roma e Milano (PVGIS −2,66 %); temperatura/bassa
  // irradianza −7,50 % Roma (PVGIS −8,12 %), −7,71 % Milano (PVGIS −8,40 %).
  // Tolleranza temperatura 1 punto: anno tipo contro media di 19 anni, e PVGIS applica
  // prima l'effetto spettrale.
  it('perdite annue per riflessione (±0,2 punti) e per temperatura/irradianza (±1 punto) come PVGIS', () => {
    expect(Math.abs((effWh / poaWh - 1) * 100 - pv.l_aoi)).toBeLessThan(0.2)
    // Energia DC rispetto a quella che darebbe un modulo sempre al rendimento di targa
    // (effWh in Wh/m²: a 1000 W/m² 1 kWp dà 1000 W, quindi si divide per i kWp).
    const lossTg = (dcWh / (effWh * year.peakPowerKwp) - 1) * 100
    expect(Math.abs(lossTg - pv.l_tg)).toBeLessThan(1)
  })

  // Energia annua contro PVcalc, dopo aver tolto la fortuna dell'anno tipo: è E_y di PVcalc
  // riscalata sulla luce dei 12 mesi reali (MRcalc). Misurato −0,48 % Roma, −0,43 % Milano
  // (senza correzione: +0,43 % e +3,47 %; fortuna dell'anno tipo +0,92 % e +3,93 %).
  // Tolleranza ±1,5 %, la stessa della conversione: la correzione toglie solo la luce.
  it('energia annua, corretta per la luce dell\'anno tipo, entro ±1,5 % di PVcalc', () => {
    expect(Math.abs(relDiff(year.annualKwh, pv.E_y * luck))).toBeLessThan(0.015)
  })

  // Lo stesso, mese per mese: E_m di PVcalc riscalata sulla luce del mese reale.
  // Sostituisce il vecchio controllo "ogni mese entro 2 deviazioni standard", che dipendeva
  // dalla fortuna del mese (a Milano settembre 2018 è a 2,03 SD con il motore corretto).
  // Massimo misurato: −3,2 % (Milano, gennaio 2018); i mesi invernali stanno fra −1 e −3 %
  // in entrambe le città. Un mese reale ha una sua temperatura e un suo spettro, diversi
  // dalla media del mese su 19 anni, e d'inverno l'energia è poca, quindi lo scarto relativo
  // pesa di più. Tolleranza ±4 %: è un controllo grossolano che ferma errori di attribuzione
  // dei mesi o di modello nell'ordine di qualche %, non uno strumento di precisione.
  it('energia di ogni mese, corretta per la luce del mese reale, entro ±4 % di PVcalc', () => {
    expect(pvcalc.outputs.monthly.fixed).toHaveLength(12)
    pvcalc.outputs.monthly.fixed.forEach((m, i) => {
      expect(m.month).toBe(i + 1)
      const expected = m.E_m * (sources[i].inclinedKwhM2 / m['H(i)_m'])
      expect(Math.abs(relDiff(year.monthlyKwh[i], expected))).toBeLessThan(0.04)
    })
  })
})

// Non regressione: il caso segnalato nell'issue #10 (Milano 45,4642 N 9,19 E, 20 × 430 W =
// 8,6 kWp, Sud 35°, perdite 0). Valore calcolato l'8/11/2026 con il motore validato sopra:
// 14 122,21 kWh. PVcalc dà 13 647,99 kWh: la differenza (+3,47 %) è la luce in più
// dell'anno tipo, non un errore (vedi sopra). Tolleranza ±1 kWh: il calcolo è deterministico
// e qualunque cambiamento del modello o dei dati lo sposta di più; se cambia apposta,
// si aggiorna questo numero spiegando il perché.
describe('non regressione: Milano, 8,6 kWp, Sud 35°, perdite 0', () => {
  it('14 122 ± 1 kWh l\'anno', () => {
    const y = simulateYear(milano.tmy, milano.pvcalcSystem)
    expect(Math.abs(y.annualKwh - 14_122)).toBeLessThan(1)
  })
})

// Non regressione: Livorno centro (43,5485 N 10,3106 E), il primo fixture con vento negativo
// vicino a un cambio di mese (issue #28: 2 ore portate a 0 m/s dal parser). 1 kWp, Sud 35°,
// perdite 0. Valore calcolato il 10/11/2026 con questo motore: NON è un riferimento esterno
// (PVGIS non è stato confrontato su questo punto), serve solo ad accorgersi se il calcolo
// su un TMY con ore corrette cambia. Tolleranza ±0,01 kWh: il calcolo è deterministico e la
// correzione del vento vale circa 0,0035 kWh, quindi la tolleranza non la nasconde del tutto
// ma lascia margine agli arrotondamenti dell'aritmetica in virgola mobile.
describe('non regressione: Livorno, 1 kWp, Sud 35°, perdite 0', () => {
  it('1669,197 ± 0,01 kWh l\'anno', () => {
    const livornoTmy = parsePvgisTmy(livornoTmyRaw)
    expect(livornoTmy.windSpeedClamped).toHaveLength(2)
    const y = simulateYear(livornoTmy, { ...oneKwp(35, 180), systemLossPct: 0 })
    expect(Math.abs(y.annualKwh - 1669.197)).toBeLessThan(0.01)
  })
})

/*
 * Orizzonte del terreno (issue #25), Aosta centro (45,737 N 7,3201 E): fra le città provate è
 * quella in cui le montagne tolgono più luce diretta. L'ombra non la calcoliamo noi: la applica
 * PVGIS nell'anno tipo (`usehorizon=1`), azzerando la DNI quando il sole è dietro il profilo del
 * terreno. Qui si verifica che quei dati siano ciò che crediamo, con tre prove indipendenti:
 *   1. i due anni tipo (con e senza orizzonte) differiscono solo dove devono;
 *   2. le ore in ombra sono esattamente quelle col sole sotto il profilo `printhorizon`;
 *   3. la luce persa sul piano Sud 35° è quella che MRcalc dà per gli stessi mesi reali.
 * Misure del 10/11/2026 (tech-lead) e dell'11/11/2026 (SWD), uguali; Bolzano e Sondrio, misurati
 * una volta sola, nel README dei fixture.
 *
 * SE QUESTI TEST FALLISCONO DOPO AVER RISCARICATO I FIXTURE, il motore può non avere colpe: il JRC
 * può aver cambiato il modello del terreno (DEM), il profilo dell'orizzonte o l'algoritmo con cui
 * PVGIS calcola la posizione del sole. Vanno rimisurati i valori qui sotto.
 */
describe('orizzonte del terreno (Aosta, issue #25)', () => {
  const RELOAD_HINT =
    ' — se succede dopo aver riscaricato i fixture, PVGIS può aver cambiato il DEM, il profilo ' +
    "dell'orizzonte o l'algoritmo della posizione del sole (vedi __fixtures__/README.md)"
  const withHorizon = parsePvgisTmy(aostaTmyRaw)
  const noHorizon = parsePvgisTmy(aostaTmyNoHorizonRaw)
  const profile = parsePvgisHorizon(aostaHorizonRaw)
  const mrcalcWith = parsePvgisMonthly(aostaMrcalcRaw)
  const mrcalcWithout = parsePvgisMonthly(aostaMrcalcNoHorizonRaw)
  const s35 = { ...oneKwp(35, 180), systemLossPct: 0 }

  /** Ore in cui GHI o DNI cambiano fra i due anni tipo. */
  const changed = withHorizon.hours.flatMap((h, i) => {
    const o = noHorizon.hours[i]
    return h.ghiWm2 !== o.ghiWm2 || h.dniWm2 !== o.dniWm2 ? [i] : []
  })

  it('i file sono quelli attesi: stesso punto, uno con e uno senza orizzonte', () => {
    expect(withHorizon.usesHorizon).toBe(true)
    expect(noHorizon.usesHorizon).toBe(false)
    expect(mrcalcWith.usesHorizon).toBe(true)
    expect(mrcalcWithout.usesHorizon).toBe(false)
    for (const x of [withHorizon, noHorizon, mrcalcWith, mrcalcWithout, profile]) {
      expect(x.latitude).toBe(45.737)
      expect(x.longitude).toBe(7.3201)
    }
    expect([mrcalcWith.tiltDeg, mrcalcWith.azimuthDeg, mrcalcWithout.tiltDeg, mrcalcWithout.azimuthDeg]).toEqual([35, 180, 35, 180])
  })

  // Prova 1. Misurato: 531 ore, e in tutte la DNI con orizzonte è esattamente 0 (PVGIS non dà
  // ombre parziali). Nessuna tolleranza: sono dati di PVGIS confrontati con dati di PVGIS.
  it('stessi mesi e istanti; cambiano solo GHI e DNI, in 531 ore, e lì DNI = 0 e GHI = DHI', () => {
    expect(withHorizon.monthsSelected).toEqual(noHorizon.monthsSelected)
    expect(withHorizon.irradianceTimeOffsetH).toBe(noHorizon.irradianceTimeOffsetH)
    withHorizon.hours.forEach((h, i) => {
      const o = noHorizon.hours[i]
      expect(h.time).toEqual(o.time)
      expect([h.airTemperatureC, h.windSpeedMs, h.dhiWm2]).toEqual([o.airTemperatureC, o.windSpeedMs, o.dhiWm2])
    })
    // Anche le colonne che il lettore non usa (umidità, infrarosso, direzione del vento, pressione).
    const rows1 = aostaTmyRaw.outputs.tmy_hourly as Record<string, unknown>[]
    const rows0 = aostaTmyNoHorizonRaw.outputs.tmy_hourly as Record<string, unknown>[]
    const withoutGhiDni = (r: Record<string, unknown>) =>
      Object.fromEntries(Object.entries(r).filter(([k]) => k !== 'G(h)' && k !== 'Gb(n)'))
    rows1.forEach((r, i) => expect(withoutGhiDni(r)).toEqual(withoutGhiDni(rows0[i])))
    expect(changed.length, `ore cambiate dall'orizzonte${RELOAD_HINT}`).toBe(531)
    for (const i of changed) {
      const h = withHorizon.hours[i]
      expect(noHorizon.hours[i].dniWm2).toBeGreaterThan(0)
      expect(h.dniWm2).toBe(0)
      expect(h.ghiWm2).toBe(h.dhiWm2)
    }
  })

  // Tolleranza 0,25° attorno al profilo. Il profilo di PVGIS è arrotondato a 0,1° (±0,05°) e la
  // nostra posizione del sole (NOAA, verificata entro 0,01° in solarPosition.test.ts) differisce
  // da quella di PVGIS (fino a 0,4° col sole alto, misurato l'8/11/2026 su `H_sun`; qui, vicino
  // all'orizzonte, le ore classificate male sono a ≤ 0,107° dal profilo): 0,05 + 0,11 ≈ 0,16°,
  // margine circa 1,5-2×. La rifrazione (0,06-0,13° fra 7° e 15° di altezza) sta dentro: con
  // l'elevazione apparente il risultato è lo stesso (misurato l'11/11/2026).
  const PROFILE_TOLERANCE_DEG = 0.25

  /**
   * Prova 2. Per ogni ora con diretta nell'anno tipo senza orizzonte: posizione del sole (NOAA,
   * `solarPosition`) all'istante delle irradianze (`time` + ritardo di PVGIS), elevazione
   * GEOMETRICA, contro l'altezza del profilo nella stessa direzione, interpolata linearmente.
   * Un'ora è "classificata male" se l'ombra di PVGIS (DNI = 0) non coincide con "sole sotto il
   * profilo". I parametri servono a mostrare che la prova si accorge degli errori.
   */
  function classify(offsetH: number, heightAt: (azimuthDeg: number) => number) {
    const offsetMs = offsetH * 3_600_000
    const wrongPerDay = new Map<string, number>()
    let considered = 0
    let maxWrongDeg = 0
    let wrongFarFromProfile = 0
    noHorizon.hours.forEach((o, i) => {
      if (!(o.dniWm2 > 0)) return
      considered++
      const sun = solarPosition(new Date(o.time.getTime() + offsetMs), withHorizon.latitude, withHorizon.longitude)
      const marginDeg = sun.elevation - heightAt(sun.azimuth)
      const shadedByPvgis = withHorizon.hours[i].dniWm2 === 0
      if (marginDeg < 0 !== shadedByPvgis) {
        const day = o.time.toISOString().slice(0, 10)
        wrongPerDay.set(day, (wrongPerDay.get(day) ?? 0) + 1)
        maxWrongDeg = Math.max(maxWrongDeg, Math.abs(marginDeg))
        if (Math.abs(marginDeg) > PROFILE_TOLERANCE_DEG) wrongFarFromProfile++
      }
    })
    const wrong = [...wrongPerDay.values()]
    return { considered, wrong: sum(wrong), maxPerDay: Math.max(0, ...wrong), maxWrongDeg, wrongFarFromProfile }
  }


  // Misurato l'11/11/2026: 3534 ore considerate, 5 classificate male (5 giorni diversi, 1 per
  // giorno), al più 0,107° dal profilo. Ore di confine: il sole passa dietro la cresta durante
  // l'ora e i due calcoli del sole la mettono da parti opposte.
  it('le ore in ombra sono quelle col sole sotto il profilo dell\'orizzonte (± 0,25°, ≤ 1 ora di confine al giorno)', () => {
    const r = classify(withHorizon.irradianceTimeOffsetH, profile.heightAt)
    expect(r.considered).toBe(3534)
    expect(r.wrongFarFromProfile, `ore classificate male a più di ${PROFILE_TOLERANCE_DEG}° dal profilo${RELOAD_HINT}`).toBe(0)
    expect(r.maxPerDay, `ore di confine nello stesso giorno${RELOAD_HINT}`).toBeLessThanOrEqual(1)
  })

  // La prova si accorge degli errori che dovrebbe fermare (misurato l'11/11/2026, ore classificate
  // male a più di 0,25° dal profilo): senza il ritardo di ~10 minuti 84; col gradino di 7,5° più
  // vicino invece dell'interpolazione 12; con Est e Ovest scambiati (azimut 360 − A) 595.
  it('si accorge di un ritardo dimenticato, di un profilo a gradini e di Est/Ovest scambiati', () => {
    const { points, stepDeg } = profile
    const nearestStep = (az: number) => points[Math.round((((az % 360) + 360) % 360) / stepDeg) % points.length].heightDeg
    expect(classify(0, profile.heightAt).wrongFarFromProfile).toBeGreaterThan(50)
    expect(classify(withHorizon.irradianceTimeOffsetH, nearestStep).wrongFarFromProfile).toBeGreaterThan(5)
    expect(classify(withHorizon.irradianceTimeOffsetH, (az) => profile.heightAt(360 - az)).wrongFarFromProfile).toBeGreaterThan(100)
  })

  /**
   * Prova 3. Luce sul piano Sud 35° (nostra trasposizione, `simulateHour`), mese per mese, con e
   * senza orizzonte: il rapporto deve essere quello di MRcalc (con e senza orizzonte) per lo
   * STESSO mese reale da cui viene ogni mese dell'anno tipo. Così la "fortuna" dell'anno tipo
   * non entra nel confronto (come nella validazione con MRcalc sopra, issue #10) e si verifica
   * anche che la nostra diffusa reagisca all'ombra come quella di PVGIS (con DNI = 0 il modello
   * di Muneer tratta l'ora come cielo coperto; PVGIS fa lo stesso).
   */
  const offsetMs = withHorizon.irradianceTimeOffsetH * 3_600_000
  const monthlyPoa = (t: Tmy) => {
    const months = new Array<number>(12).fill(0)
    for (const h of t.hours) {
      const r = simulateHour({ ...h, time: new Date(h.time.getTime() + offsetMs) }, t.latitude, t.longitude, s35)
      months[h.time.getUTCMonth()] += r.poaGlobalWm2 / 1000
    }
    return months
  }
  const poaWith = monthlyPoa(withHorizon)
  const poaWithout = monthlyPoa(noHorizon)
  const sourceMonths = withHorizon.monthsSelected.slice().sort((a, b) => a.month - b.month)
  const mrWith = sourceMonths.map((s) => mrcalcWith.get(s.year, s.month).inclinedKwhM2)
  const mrWithout = sourceMonths.map((s) => mrcalcWithout.get(s.year, s.month).inclinedKwhM2)

  // Misurato l'11/11/2026: scarto peggiore +0,26 % (gennaio 2008: noi −27,82 %, MRcalc
  // −28,01 %), poi −0,18 % (dicembre 2016); da aprile a settembre l'ombra è quasi nulla e lo
  // scarto ≤ 0,08 %. Tolleranza ±0,5 %: circa 2× il massimo, e i rapporti sono molto più
  // precisi delle irradiazioni assolute (±1 % sopra) perché gli errori comuni si semplificano.
  it('rapporto con/senza orizzonte di ogni mese entro ±0,5 % di MRcalc sullo stesso mese reale', () => {
    sourceMonths.forEach((s, i) => {
      const d = relDiff(poaWith[i] / poaWithout[i], mrWith[i] / mrWithout[i])
      expect(Math.abs(d), `mese ${s.month}/${s.year}: scarto ${(d * 100).toFixed(3)} %${RELOAD_HINT}`).toBeLessThan(0.005)
    })
  })

  // Misurato l'11/11/2026: luce persa nell'anno 103,09 kWh/m² (noi) contro 102,82 (MRcalc),
  // −5,938 % contro −5,924 %, scarto dei rapporti −0,015 %. Tolleranza ±0,1 %: gli scarti dei
  // mesi invernali si compensano; un errore sistematico (es. ombra applicata un'ora fuori posto)
  // la supererebbe.
  it('rapporto con/senza orizzonte dei 12 mesi entro ±0,1 % di MRcalc', () => {
    const d = relDiff(sum(poaWith) / sum(poaWithout), sum(mrWith) / sum(mrWithout))
    expect(Math.abs(d), `scarto annuo ${(d * 100).toFixed(4)} %${RELOAD_HINT}`).toBeLessThan(0.001)
  })

  // Non regressione: 1 kWp, Sud 35°, perdite 0, anno tipo con orizzonte. Valore calcolato
  // l'11/11/2026 con questo motore (1524,2898 kWh; senza orizzonte 1629,3530, −6,45 %): NON è un
  // riferimento esterno, serve ad accorgersi se il calcolo cambia. Tolleranza ±0,01 kWh come
  // Livorno: il calcolo è deterministico, resta margine solo per la virgola mobile.
  it('non regressione: 1524,290 ± 0,01 kWh l\'anno (1 kWp, Sud 35°, perdite 0)', () => {
    expect(Math.abs(simulateYear(withHorizon, s35).annualKwh - 1524.29)).toBeLessThan(0.01)
  })
})

describe('simulateYear — proprietà generali', () => {
  const base = oneKwp(35, 180)
  const year = simulateYear(tmy, base)

  it('8760 valori orari, nessuno negativo, zero di notte', () => {
    expect(year.hourlyAcPowerW).toHaveLength(TMY_HOURS)
    expect(year.hourlyAcPowerW.every((p) => p >= 0)).toBe(true)
    tmy.hours.forEach((h, i) => {
      if (h.ghiWm2 === 0) expect(year.hourlyAcPowerW[i]).toBe(0)
    })
  })

  it('la somma dei mesi è l\'anno, e l\'anno è la somma delle ore', () => {
    expect(sum(year.monthlyKwh)).toBeCloseTo(year.annualKwh, 9)
    expect(sum(year.hourlyAcPowerW) / 1000).toBeCloseTo(year.annualKwh, 6)
    expect(year.peakPowerKwp).toBe(1)
  })

  it('il doppio dei pannelli produce il doppio dell\'energia', () => {
    const double = simulateYear(tmy, { ...base, panelCount: 8 })
    expect(double.annualKwh).toBeCloseTo(2 * year.annualKwh, 6)
  })

  it('le perdite di sistema si applicano in proporzione', () => {
    const noLoss = simulateYear(tmy, { ...base, systemLossPct: 0 })
    expect(year.annualKwh).toBeCloseTo(noLoss.annualKwh * 0.86, 6)
  })

  it('perdite predefinite = 14 %, albedo predefinita = 0,2', () => {
    const defaults = simulateYear(tmy, { tiltDeg: 35, azimuthDeg: 180, panelCount: 4, panelPowerWp: 250 })
    expect(defaults.annualKwh).toBe(year.annualKwh)
    expect(simulateYear(tmy, { ...base, albedo: 0.2 }).annualKwh).toBe(year.annualKwh)
  })

  it('a Roma un tetto a Sud produce più di uno a Nord', () => {
    expect(year.annualKwh).toBeGreaterThan(simulateYear(tmy, { ...base, azimuthDeg: 0 }).annualKwh)
  })

  it('rifiuta parametri impossibili', () => {
    expect(() => simulateYear(tmy, { ...base, tiltDeg: 95 })).toThrow(RangeError)
    expect(() => simulateYear(tmy, { ...base, azimuthDeg: 360 })).toThrow(RangeError)
    expect(() => simulateYear(tmy, { ...base, panelCount: 2.5 })).toThrow(RangeError)
    expect(() => simulateYear(tmy, { ...base, panelPowerWp: -1 })).toThrow(RangeError)
    expect(() => simulateYear(tmy, { ...base, systemLossPct: 100 })).toThrow(RangeError)
  })
})
