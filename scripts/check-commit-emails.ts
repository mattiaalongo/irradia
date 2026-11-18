// Controllo automatico degli indirizzi email nei commit (decisione del PO del 18/11/2026).
//
// Motivo: il repository diventerà pubblico e la storia è stata ripulita dall'email personale
// del PO (15/11/2026). Questo controllo impedisce che un commit nuovo la reintroduca,
// per distrazione di una sessione o di un PC mal configurato.
//
// Cosa si controlla, su TUTTA la storia raggiungibile dal commit indicato (~150
// commit: costa meno di un secondo e non ci sono casi limite di base o di `before`):
// autore, committer e trailer `Co-authored-by`. Ogni indirizzo deve stare
// nell'elenco chiuso `ALLOWED_COMMIT_EMAILS`.
//
// Gira con `node` puro (Node 22.18+ esegue i .ts togliendo i tipi), solo moduli di
// Node, senza `npm ci`: ogni dipendenza è codice di terzi.
//
// Variabile d'ambiente: COMMIT_SHA = commit di partenza. In CI è OBBLIGATORIA (si
// passa l'head della PR, non il merge sintetico che GitHub crea con dati che non
// controlliamo); in locale, se manca, si usa HEAD.
//
// Il messaggio d'errore dice SOLO quale commit e quale campo: mai l'indirizzo, né
// una sua parte, perché i log della CI sono pubblici.

import { appendFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

// Elenco chiuso degli indirizzi consentiti, UNICO posto in cui vive. Confronto senza
// distinzione fra maiuscole e minuscole, dopo trim. Per cambiarlo serve il PO.
export const ALLOWED_COMMIT_EMAILS: readonly string[] = [
  // Claude (autore dei commit delle sessioni cloud e del trailer Co-Authored-By).
  'noreply@anthropic.com',
  // Indirizzo noreply di GitHub del PO: è già pubblico nella storia ripulita.
  '254344956+mattiaalongo@users.noreply.github.com',
  // Committer delle unioni e delle modifiche fatte dal sito di GitHub.
  'noreply@github.com',
  // Dependabot.
  '49699333+dependabot[bot]@users.noreply.github.com',
]

export type EmailField = 'author' | 'committer' | 'co-author'

export interface CommitEmails {
  sha: string
  authorEmail: string
  committerEmail: string
  /** Valori grezzi dei trailer Co-authored-by (es. "Nome <indirizzo>"). */
  coAuthors: string[]
}

export interface Violation {
  sha: string
  field: EmailField
}

function isAllowed(email: string, allowed: readonly string[]): boolean {
  const e = email.trim().toLowerCase()
  // Mai consentito un indirizzo con spazi interni o caratteri di controllo
  // (compresi i nostri separatori): non può coincidere con un indirizzo dell'elenco.
  if (e === '' || /[\s\p{Cc}]/u.test(e)) return false
  return allowed.some((a) => a.trim().toLowerCase() === e)
}

/**
 * Indirizzo di un trailer "Nome <indirizzo>"; `null` se il valore non è verificabile
 * (= violazione). Valido solo con esattamente una `<` e una `>`, nessun a capo e
 * l'indirizzo alla fine: altrimenti una seconda coppia o una riga di continuazione
 * resterebbero senza controllo.
 */
export function extractTrailerEmail(value: string): string | null {
  const v = value.trim()
  if (/[\r\n]/.test(v)) return null
  const m = /^[^<>]*<([^<>]*)>$/.exec(v)
  return m ? m[1] : null
}

/** Elenco delle violazioni: indirizzo non consentito, vuoto o non verificabile. */
export function findViolations(
  commits: readonly CommitEmails[],
  allowed: readonly string[] = ALLOWED_COMMIT_EMAILS,
): Violation[] {
  const out: Violation[] = []
  for (const c of commits) {
    if (!isAllowed(c.authorEmail, allowed)) out.push({ sha: c.sha, field: 'author' })
    if (!isAllowed(c.committerEmail, allowed)) out.push({ sha: c.sha, field: 'committer' })
    for (const t of c.coAuthors) {
      const email = extractTrailerEmail(t)
      if (email === null || !isAllowed(email, allowed)) out.push({ sha: c.sha, field: 'co-author' })
    }
  }
  return out
}

const FIELD_IT: Record<EmailField, string> = {
  author: 'autore',
  committer: 'committer',
  'co-author': 'co-autore',
}

/** Messaggio per l'utente: solo SHA e campo, mai l'indirizzo. */
export function formatViolations(violations: readonly Violation[]): string {
  const lines = violations.map((v) => `- commit ${v.sha}: indirizzo non consentito nel campo ${FIELD_IT[v.field]}`)
  return [
    `Indirizzi email non consentiti nei commit: ${violations.length}`,
    ...lines,
    '',
    "Per vedere l'indirizzo in locale (non viene stampato qui perché i log sono pubblici):",
    "  git log -1 --format='%ae | %ce | %(trailers:key=Co-authored-by,valueonly)' <sha>",
    "Gli indirizzi consentiti sono in ALLOWED_COMMIT_EMAILS (scripts/check-commit-emails.ts).",
  ].join('\n')
}

// Separatori che non possono comparire in un indirizzo o in un hash: 0x1f fra i campi,
// 0x1e fra i trailer, 0x00 alla fine di ogni commit.
const FIELD_SEP = '\x1f'
const TRAILER_SEP = '\x1e'
const RECORD_SEP = '\x00'

/**
 * Interpreta l'output di `git log` col formato di `readCommits`. Un record che non ha
 * esattamente 4 campi (un separatore dentro un indirizzo o un trailer sposterebbe i
 * campi e potrebbe nascondere un indirizzo) è letto in modo non affidabile: diventa
 * una violazione su autore, committer e co-autore (i campi grezzi restano nei
 * co-autori, che senza un indirizzo valido sono violazioni). Le violazioni dicono solo
 * sha e campo, quindi nessun indirizzo finisce nel log.
 */
export function parseGitLog(raw: string): CommitEmails[] {
  return raw
    .split(RECORD_SEP)
    .map((r) => r.replace(/^\n+/, ''))
    .filter((r) => r !== '')
    .map((r) => {
      const fields = r.split(FIELD_SEP)
      if (fields.length !== 4) {
        return { sha: fields[0], authorEmail: '', committerEmail: '', coAuthors: fields.slice(1).concat('') }
      }
      const [sha, authorEmail, committerEmail, trailers] = fields
      const coAuthors = trailers
        .split(TRAILER_SEP)
        .map((t) => t.trim())
        .filter((t) => t !== '')
      return { sha, authorEmail, committerEmail, coAuthors }
    })
}

function git(args: string[], cwd?: string): string {
  // `--no-replace-objects` (opzione globale, prima del sottocomando) su OGNI comando:
  // senza, `git replace` (refs/replace) potrebbe far leggere al controllo un commit
  // diverso da quello vero e nascondere un indirizzo non consentito.
  return execFileSync('git', ['--no-replace-objects', ...args], { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] })
}

/** Errore che il main trasforma in rifiuto (exit 1) con un messaggio chiaro. */
export class CheckRefusal extends Error {}

/**
 * Legge da git tutti i commit raggiungibili da `sha`. Ignora `.mailmap`
 * (`log.mailmap=false` e `%ae`/`%ce`, non `%aE`/`%cE`): si controlla l'indirizzo
 * scritto davvero nel commit. Rifiuta repository incompleti, SHA inesistenti e
 * storie vuote: senza questi rifiuti il verde potrebbe non voler dire nulla.
 */
export function readCommits(sha: string, cwd?: string): CommitEmails[] {
  if (git(['rev-parse', '--is-shallow-repository'], cwd).trim() === 'true') {
    throw new CheckRefusal(
      'Il repository è incompleto (shallow): controllare solo una parte della storia darebbe un verde falso. Usa fetch-depth: 0.',
    )
  }
  try {
    git(['rev-parse', '--verify', '--quiet', `${sha}^{commit}`], cwd)
  } catch {
    throw new CheckRefusal(`Il commit indicato non esiste in questo repository: ${sha}`)
  }
  const format = ['%H', '%ae', '%ce', '%(trailers:key=Co-authored-by,valueonly,separator=%x1e)'].join('%x1f') + '%x00'
  const raw = git(['-c', 'log.mailmap=false', 'log', `--format=${format}`, sha, '--'], cwd)
  const commits = parseGitLog(raw)
  if (commits.length === 0) throw new CheckRefusal('Nessun commit trovato: impossibile verificare gli indirizzi.')
  return commits
}

function main(): void {
  let sha = process.env.COMMIT_SHA?.trim()
  if (!sha) {
    if (process.env.GITHUB_ACTIONS) {
      console.error('COMMIT_SHA non è impostata: in CI va passata esplicitamente (head della PR o commit del push).')
      process.exit(1)
    }
    sha = 'HEAD' // in locale basta HEAD
  }

  let commits: CommitEmails[]
  try {
    commits = readCommits(sha)
  } catch (e) {
    console.error(e instanceof CheckRefusal ? e.message : `Impossibile leggere la storia di git: ${(e as Error).message}`)
    process.exit(1)
  }

  const violations = findViolations(commits)
  const ok = violations.length === 0
  const message = ok
    ? `Indirizzi email dei commit: OK (${commits.length} commit controllati: autore, committer e co-autori).`
    : formatViolations(violations)
  if (ok) console.log(message)
  else console.error(message)

  const summaryPath = process.env.GITHUB_STEP_SUMMARY
  if (summaryPath) {
    const md = ok
      ? `### Indirizzi email dei commit\n\nOK: ${commits.length} commit controllati.\n`
      : `### Indirizzi email dei commit\n\nERRORE: ${violations.length} indirizzi non consentiti su ${commits.length} commit controllati. Dettagli (solo commit e campo) nel log del passo.\n`
    appendFileSync(summaryPath, md + '\n')
  }
  if (!ok) process.exit(1)
}

// Parte solo se lanciato da riga di comando, non quando lo importano i test.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
