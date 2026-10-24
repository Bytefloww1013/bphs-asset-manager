// Built-CSS baseline: the hash of the built stylesheet, so a module folder Tailwind stops scanning (a missing `@source` line in
// web/src/styles.css) can't silently drop the rules for classes still in use. The hash also changes whenever a class starts or
// stops being used anywhere, so a failure names the selectors that came or went, against the selector list recorded with the hash.
//
//   node docs/verify/css-baseline.mjs            build, then compare with docs/verify/baseline/web-css.sha256; exit 1 if it differs
//   node docs/verify/css-baseline.mjs --record   build, then write web-css.sha256 and web-css.selectors
// Env:  SKIP_BUILD=1 uses the build already in dist/web (as verify-done.sh does, after its own build).
//
// Re-record only when every selector it names is one your branch meant to add or remove; a selector your branch still uses that
// shows as removed is a missed `@source` line (how-tos/update-verify-baselines.md). One PASS/FAIL line, then the differences.
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** Where scratch files go: `BPHS_TMP`, else the system temp folder. */
const TMP = process.env.BPHS_TMP ?? process.env.TMPDIR ?? '/tmp'

const REPO = fileURLToPath(new URL('../..', import.meta.url))
const STATIC = path.join(REPO, 'dist/web/static')
const HASH_FILE = path.join(REPO, 'docs/verify/baseline/web-css.sha256')
const SELECTORS_FILE = path.join(REPO, 'docs/verify/baseline/web-css.selectors')
const record = process.argv.includes('--record')

if (process.env.SKIP_BUILD !== '1') {
  fs.mkdirSync(TMP, { recursive: true })
  const log = path.join(TMP, 'bphs-css-build.log')
  const build = spawnSync('bun', ['run', 'build'], { cwd: REPO, encoding: 'utf8' })
  fs.writeFileSync(log, `${build.stdout ?? ''}${build.stderr ?? ''}`)
  if (build.status !== 0) {
    console.log(`FAIL: build (log: ${log})`)
    process.exit(1)
  }
}

// The same bytes verify-done.sh has always hashed: every built CSS file, in name order, concatenated.
const files = fs.existsSync(STATIC) ? fs.readdirSync(STATIC).filter((name) => name.endsWith('.css')).sort() : []
if (!files.length) {
  console.log(`FAIL: no built CSS in ${path.relative(REPO, STATIC)} (run without SKIP_BUILD=1)`)
  process.exit(1)
}
const css = files.map((name) => fs.readFileSync(path.join(STATIC, name), 'utf8')).join('')
const hash = createHash('sha256').update(css).digest('hex')

/**
 * Every rule's selector with the at-rules and nesting around it (`@media (width>=48rem) > .md\:grid-cols-2`), sorted and
 * unique: what Tailwind generated, without the declarations, so a diff reads as classes added and removed.
 */
function selectors(text) {
  const found = new Set()
  const stack = []
  let prelude = ''
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2)
      i = end < 0 ? text.length : end + 1
    } else if (c === '"' || c === "'") {
      let j = i + 1
      while (j < text.length && text[j] !== c) j += text[j] === '\\' ? 2 : 1
      prelude += text.slice(i, j + 1)
      i = j
    } else if (c === '{') {
      stack.push(prelude.trim())
      found.add(stack.join(' > '))
      prelude = ''
    } else if (c === '}') {
      stack.pop()
      prelude = ''
    } else if (c === ';') {
      prelude = ''
    } else {
      prelude += c
    }
  }
  return [...found].sort()
}

const current = selectors(css)

if (record) {
  fs.writeFileSync(HASH_FILE, `${hash}\n`)
  fs.writeFileSync(SELECTORS_FILE, `${current.join('\n')}\n`)
  console.log(`recorded: ${path.relative(REPO, HASH_FILE)} (${hash}), ${path.relative(REPO, SELECTORS_FILE)} (${current.length} selectors)`)
  process.exit(0)
}

const baseline = fs.readFileSync(HASH_FILE, 'utf8').trim()
if (hash === baseline) {
  console.log('PASS: built CSS matches the baseline')
  process.exit(0)
}
console.log(`FAIL: built CSS differs from the baseline (${hash}, baseline ${baseline})`)
if (!fs.existsSync(SELECTORS_FILE)) {
  console.log(`No ${path.relative(REPO, SELECTORS_FILE)} to compare with: record one from main to see which selectors changed.`)
  process.exit(1)
}
const before = new Set(fs.readFileSync(SELECTORS_FILE, 'utf8').split('\n').filter(Boolean))
const now = new Set(current)
const added = current.filter((s) => !before.has(s))
const removed = [...before].filter((s) => !now.has(s))
for (const s of added) console.log(`+ ${s}`)
for (const s of removed) console.log(`- ${s}`)
if (!added.length && !removed.length) console.log('Same selectors: only declarations changed (web/src/styles.css, the theme or a Tailwind upgrade).')
console.log('Re-record with --record only if every selector above is one your branch meant to add or remove.')
process.exit(1)
