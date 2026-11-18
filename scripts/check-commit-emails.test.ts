import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  ALLOWED_COMMIT_EMAILS,
  CheckRefusal,
  extractTrailerEmail,
  findViolations,
  formatViolations,
  parseGitLog,
  readCommits,
  type CommitEmails,
} from './check-commit-emails.ts'

const OK = 'noreply@anthropic.com'
const BAD = 'someone@example.com'
const commit = (o: Partial<CommitEmails> = {}): CommitEmails => ({
  sha: 'abc1234',
  authorEmail: OK,
  committerEmail: OK,
  coAuthors: [],
  ...o,
})

describe('findViolations', () => {
  it('accetta tutti gli indirizzi consentiti, anche in maiuscolo e con spazi', () => {
    for (const a of ALLOWED_COMMIT_EMAILS) {
      const c = commit({ authorEmail: ` ${a.toUpperCase()} `, committerEmail: a, coAuthors: [`Nome <${a.toUpperCase()}>`] })
      expect(findViolations([c])).toEqual([])
    }
  })

  it('segnala autore, committer e co-autore non consentiti', () => {
    expect(findViolations([commit({ authorEmail: BAD })])).toEqual([{ sha: 'abc1234', field: 'author' }])
    expect(findViolations([commit({ committerEmail: BAD })])).toEqual([{ sha: 'abc1234', field: 'committer' }])
    expect(findViolations([commit({ coAuthors: [`X <${BAD}>`] })])).toEqual([{ sha: 'abc1234', field: 'co-author' }])
  })

  it('email vuota = violazione', () => {
    expect(findViolations([commit({ authorEmail: '', committerEmail: '  ' })]).map((v) => v.field)).toEqual(['author', 'committer'])
  })

  it('un trailer senza <indirizzo> è una violazione (non verificabile)', () => {
    expect(findViolations([commit({ coAuthors: ['Solo Nome'] })])).toEqual([{ sha: 'abc1234', field: 'co-author' }])
    expect(extractTrailerEmail('Nome <a@b.it>')).toBe('a@b.it')
    expect(extractTrailerEmail('Nome')).toBeNull()
  })

  it('il messaggio contiene sha e campo ma mai l\'indirizzo né sue parti', () => {
    const msg = formatViolations(
      findViolations([commit({ authorEmail: BAD, coAuthors: [`X <${BAD}>`] })]),
    )
    expect(msg).toContain('abc1234')
    expect(msg).toContain('autore')
    expect(msg).toContain('co-autore')
    expect(msg).not.toContain('someone')
    expect(msg).not.toContain('example.com')
  })
})

describe('readCommits (repository git temporaneo)', () => {
  let dir: string
  let home: string
  const env = (email = OK, name = 'Test') => ({
    ...process.env,
    HOME: home,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_AUTHOR_NAME: name,
    GIT_AUTHOR_EMAIL: email,
    GIT_COMMITTER_NAME: name,
    GIT_COMMITTER_EMAIL: email,
  })
  const git = (cwd: string, args: string[], email?: string) =>
    execFileSync('git', args, { cwd, env: env(email), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  const commitIn = (cwd: string, msg: string, email?: string) => {
    git(cwd, ['commit', '--allow-empty', '-q', '-m', msg], email)
    return git(cwd, ['rev-parse', 'HEAD'])
  }
  const init = (name: string) => {
    const d = join(dir, name)
    execFileSync('git', ['init', '-q', '-b', 'main', d], { env: env() })
    return d
  }

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'emails-'))
    home = mkdtempSync(join(tmpdir(), 'home-'))
  })
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true })
    rmSync(home, { recursive: true, force: true })
  })

  it('tutto consentito, con trailer Co-Authored-By: verde', () => {
    const d = init('ok')
    commitIn(d, 'uno')
    const sha = commitIn(d, `due\n\nCo-Authored-By: Claude <${OK}>`, 'noreply@github.com')
    const commits = readCommits(sha, d)
    expect(commits).toHaveLength(2)
    expect(commits[0].coAuthors).toEqual([`Claude <${OK}>`])
    expect(findViolations(commits)).toEqual([])
  })

  it('un commit con un indirizzo non consentito: rosso', () => {
    const d = init('bad')
    commitIn(d, 'uno')
    const bad = commitIn(d, 'due', BAD)
    const sha = commitIn(d, 'tre')
    const v = findViolations(readCommits(sha, d))
    expect(v).toEqual([
      { sha: bad, field: 'author' },
      { sha: bad, field: 'committer' },
    ])
  })

  it('.mailmap che rimappa su un indirizzo consentito non nasconde la violazione', () => {
    const d = init('mailmap')
    writeFileSync(join(d, '.mailmap'), `Test <${OK}> <${BAD}>\n`)
    git(d, ['add', '.mailmap'])
    git(d, ['commit', '-q', '-m', 'mailmap'])
    const sha = commitIn(d, 'x', BAD)
    expect(findViolations(readCommits(sha, d)).map((v) => v.field)).toEqual(['author', 'committer'])
  })

  it('trailer co-authored-by con chiave minuscola e indirizzo non consentito: rosso', () => {
    const d = init('trailer')
    const sha = commitIn(d, `x\n\nco-authored-by: Qualcuno <${BAD}>`)
    expect(findViolations(readCommits(sha, d))).toEqual([{ sha, field: 'co-author' }])
  })

  it('copia shallow: rifiuto', () => {
    const d = init('full')
    commitIn(d, 'uno')
    const sha = commitIn(d, 'due')
    const s = join(dir, 'shallow')
    execFileSync('git', ['clone', '-q', '--depth', '1', `file://${d}`, s], { env: env() })
    expect(() => readCommits(sha, s)).toThrow(CheckRefusal)
    expect(() => readCommits(sha, s)).toThrow(/shallow/)
  })

  it('SHA inesistente: rifiuto', () => {
    const d = init('nosha')
    commitIn(d, 'uno')
    expect(() => readCommits('0'.repeat(40), d)).toThrow(/non esiste/)
  })
})

// Difetti trovati dal tester e corretti. Indirizzi solo finti @example.com.
describe('difetti noti del controllo (tester, 18/11/2026)', () => {
  it('trailer con due coppie <...>: la seconda coppia non viene controllata', () => {
    const c = commit({ coAuthors: [`Nome <${OK}> <${BAD}>`] })
    expect(findViolations([c]).length).toBeGreaterThan(0)
  })

  it('trailer con riga di continuazione: la seconda riga non viene controllata', () => {
    const c = commit({ coAuthors: [`Nome <${OK}>\n <${BAD}>`] })
    expect(findViolations([c]).length).toBeGreaterThan(0)
  })

  it('0x1f dentro l\'email dell\'autore sposta i campi: il committer non consentito sparisce', () => {
    // email dell'autore = "OK\x1fOK\x1f\x1fb" (git la conserva), committer = BAD.
    const raw = ['sha1', `${OK}\x1f${OK}\x1f\x1fb`, BAD, ''].join('\x1f') + '\x00'
    expect(findViolations(parseGitLog(raw)).length).toBeGreaterThan(0)
  })

  it('0x1f nel trailer tronca il resto: l\'indirizzo dopo il separatore non è controllato', () => {
    const raw = ['sha1', OK, OK, `Nome <${OK}>\x1f<${BAD}>`].join('\x1f') + '\x00'
    const commits = parseGitLog(raw)
    expect(commits.map((c) => c.coAuthors.join('|')).join()).toContain(BAD)
  })

  it('git replace: un commit sostituito nasconde l\'indirizzo non consentito (manca --no-replace-objects)', () => {
    const home = mkdtempSync(join(tmpdir(), 'home-'))
    const d = mkdtempSync(join(tmpdir(), 'repl-'))
    try {
      const mk = (email: string) => ({
        ...process.env,
        HOME: home,
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_AUTHOR_NAME: 'T',
        GIT_AUTHOR_EMAIL: email,
        GIT_COMMITTER_NAME: 'T',
        GIT_COMMITTER_EMAIL: email,
      })
      const g = (args: string[], email = OK) =>
        execFileSync('git', args, { cwd: d, env: mk(email), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
      g(['init', '-q', '-b', 'main'])
      g(['commit', '--allow-empty', '-q', '-m', 'uno'])
      g(['commit', '--allow-empty', '-q', '-m', 'due'], BAD)
      const bad = g(['rev-parse', 'HEAD'])
      g(['commit', '--allow-empty', '-q', '-m', 'tre'])
      const good = g(['commit-tree', `${bad}^{tree}`, '-p', `${bad}^`, '-m', 'ok'])
      g(['replace', bad, good])
      expect(findViolations(readCommits('HEAD', d)).length).toBeGreaterThan(0)
    } finally {
      rmSync(d, { recursive: true, force: true })
      rmSync(home, { recursive: true, force: true })
    }
  })
})
