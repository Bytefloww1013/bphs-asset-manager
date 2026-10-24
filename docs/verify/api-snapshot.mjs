// API snapshot: the behaviour-neutral guard for issue #23 (kernel / foundation / feature modules).
// The refactor moves server/services, server/routes and shared/* around, but no API path or response may change. This script
// proves it from the outside: it talks to the app over HTTP only and never imports app source, so it works the same before and
// after the move.
//
// As Priya (Super Admin) and Marcus (Admin) it signs in (POST /api/auth/login, JSON, not remembered) and GETs every GET route
// the app had at commit 944638a (Hono's app.routes): lists, details, the .csv exports and the attachment downloads. Path params
// are taken from that user's own seeded data: the first item of the matching list, or for a download the first file that can
// still be downloaded, in list order. A detail route with no such record for a user is left out and named in <user>/_skipped.json.
// Each response is one file, docs/verify/baseline/api/<user>/GET_<route pattern>.json: the request made, the status, the
// content type (and disposition, for downloads) and the body: JSON pretty-printed with sorted keys, text (CSV) as an array of
// lines, anything else as its sha256 and byte length. No headers are kept, so no session or token is; the run fails if a
// session token turns up in a body.
//
//   node docs/verify/api-snapshot.mjs            record the baseline (replaces docs/verify/baseline/api)
//   node docs/verify/api-snapshot.mjs --compare  take a fresh snapshot and diff it against the baseline; exit 1 on any difference
//
// Server: unless BASE is set, it starts its own scratch server (docs/verify/scratch-server.sh, SKIP_BUILD=1, so no SPA) under
// ROOT (default $BPHS_TMP/bphs-api-snapshot) on PORT (default 3392), with FIXED_NOW=2026-10-01T13:00:00Z and TZ=UTC, and
// stops it at the end, on errors too. With BASE, the server must be freshly seeded under that clock and nothing else may have
// used it: some GETs write (reading a notice marks it read; a grievance download is logged), so a second run sees different data.
//
// Normalisation: the seed and the server run under the frozen clock, so nearly everything is the same from run to run. What
// would not be is anything SQLite stamps itself, such as the `unixepoch() * 1000` created_at defaults, which use the real
// clock. No GET response shows one at 944638a (the baseline has no "<real-now>"), but one may start to. So any timestamp
// (epoch ms, epoch seconds, or an ISO 8601 date-time, in JSON or in text) that falls inside the real time of this run, from
// 10 minutes before it started to 10 minutes after the last response, becomes "<real-now>". Only real-clock readings decide
// that window (performance.timeOrigin, which the fixed clock does not touch). Nothing else is normalised.
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** Where scratch files go: `BPHS_TMP`, else the system temp folder. */
const TMP = process.env.BPHS_TMP ?? process.env.TMPDIR ?? '/tmp'

// Real clock, read first: when this process started, and now. The window around them is what counts as "stamped during this run".
const realNow = () => performance.timeOrigin + performance.now()
const REAL_START = performance.timeOrigin
const SLACK_MS = 10 * 60 * 1000
const PLACEHOLDER = '<real-now>'

const REPO = fileURLToPath(new URL('../..', import.meta.url))
const BASELINE = path.join(REPO, 'docs/verify/baseline/api')
const COMPARE = process.argv.includes('--compare')
const PORT = process.env.PORT ?? '3392'
const OWN_SERVER = !process.env.BASE
const BASE = (process.env.BASE ?? `http://localhost:${PORT}`).replace(/\/+$/, '')
const SERVER_ENV = {
  ...process.env,
  ROOT: process.env.ROOT ?? `${TMP}/bphs-api-snapshot`,
  PORT,
  FIXED_NOW: '2026-10-01T13:00:00Z',
  TZ: 'UTC',
  SKIP_BUILD: '1',
}

const PASSWORD = 'Demo-pass1!'
const USERS = [
  { key: 'priya', email: 'p.raghunathan@bphs.local' },
  { key: 'marcus', email: 'm.oyelaran@bphs.local' },
]

// ---- Routes ------------------------------------------------------------------------------------------------------------
// Every GET in app.routes at 944638a, in that order. A route with params has a resolver: it returns the path to request, or
// the reason there is nothing to request for this user. CSRF: Hono's csrf() only looks at non-GET requests with a form-like (or
// missing) content type, so these GETs, and the JSON sign-in, need nothing from it.
const enc = encodeURIComponent
const capCode = (seq) => `CAP${String(seq).padStart(2, '0')}`
const downloadable = (files) => (Array.isArray(files) ? files.find((file) => file.withdrawnAt === null) : undefined)

/** The first item of a list route, by the key that addresses it; or why there is none. */
const firstOf = (listPath, pick, key, build) => async (ctx) => {
  const list = await ctx.json(listPath)
  const item = list && pick(list)?.[0]
  if (!item) return { skip: noRecord(ctx, listPath, 'lists nothing') }
  return build(enc(item[key]))
}

/** The first file still downloadable, going through the parents in list order. */
const firstFile = (listPath, pick, parentKey, filesPath, filesOf, build) => async (ctx) => {
  const list = await ctx.json(listPath)
  if (!list) return { skip: noRecord(ctx, listPath, 'lists nothing') }
  for (const parent of pick(list)) {
    const file = downloadable(filesOf(await ctx.json(filesPath(enc(parent[parentKey])))))
    if (file) return build(enc(parent[parentKey]), file.id)
  }
  return { skip: `no record: nothing under GET ${listPath} has a file that can still be downloaded` }
}

const noRecord = (ctx, listPath, what) => {
  const status = ctx.cache.get(listPath)?.status
  return status === 200 ? `no record: GET ${listPath} ${what}` : `no record: GET ${listPath} answered ${status}`
}

const asList = (list) => (Array.isArray(list) ? list : [])
const rows = (list) => asList(list.rows)
const grievance = firstOf('/api/grievances', rows, 'code', (code) => code)
const review = firstOf('/api/reviews', rows, 'code', (code) => code)
const under = (parent, build) => async (ctx) => {
  const found = await parent(ctx)
  return typeof found === 'string' ? build(found) : found
}

/** A notice sent to this account, from its own notifications (paged through, newest first). */
async function myNotice(ctx) {
  let page = await ctx.json('/api/me/notifications')
  while (page) {
    const notice = asList(page.items).find((item) => item.kind === 'notice' && /^\/me\/inbox\/\d+$/.test(item.link))
    if (notice) return `/api/me/notices/${notice.link.split('/').pop()}`
    if (!page.nextCursor) break
    page = await ctx.json(`/api/me/notifications?before=${page.nextCursor}&limit=50`)
  }
  return { skip: noRecord(ctx, '/api/me/notifications', 'has no notice notification') }
}

const ROUTES = [
  ['/api/health'],
  ['/api/auth/me'],
  ['/api/lookups'],
  ['/api/dashboard'],
  ['/api/audit'],
  ['/api/audit.csv'],
  ['/api/assets'],
  ['/api/assets/tag/:tag', firstOf('/api/assets', asList, 'tag', (tag) => `/api/assets/tag/${tag}`)],
  ['/api/assignments'],
  ['/api/employees'],
  ['/api/programs'],
  ['/api/digital-assets'],
  ['/api/digital-assets/:id', firstOf('/api/digital-assets', asList, 'id', (id) => `/api/digital-assets/${id}`)],
  ['/api/grievances'],
  ['/api/grievances/categories'],
  ['/api/grievances/account-holders'],
  ['/api/grievances/audit'],
  ['/api/grievances/audit.csv'],
  ['/api/grievances/:code', under(grievance, (code) => `/api/grievances/${code}`)],
  ['/api/grievances/:code/versions', under(grievance, (code) => `/api/grievances/${code}/versions`)],
  ['/api/grievances/:code/entries', under(grievance, (code) => `/api/grievances/${code}/entries`)],
  ['/api/grievances/:code/attachments', under(grievance, (code) => `/api/grievances/${code}/attachments`)],
  [
    '/api/grievances/:code/attachments/:id',
    firstFile(
      '/api/grievances',
      rows,
      'code',
      (code) => `/api/grievances/${code}/attachments`,
      (files) => files,
      (code, id) => `/api/grievances/${code}/attachments/${id}`,
    ),
  ],
  ['/api/maintenance'],
  ['/api/maintenance/:id', firstOf('/api/maintenance', asList, 'id', (id) => `/api/maintenance/${id}`)],
  ['/api/reviews'],
  ['/api/reviews/action-items'],
  ['/api/reviews/audit'],
  ['/api/reviews/audit.csv'],
  ['/api/reviews/:code', under(review, (code) => `/api/reviews/${code}`)],
  ['/api/reviews/:code/entries', under(review, (code) => `/api/reviews/${code}/entries`)],
  ['/api/reviews/:code/caps', under(review, (code) => `/api/reviews/${code}/caps`)],
  [
    '/api/reviews/:code/caps/:cap',
    // The first CAP of the first review that has one, addressed as the SPA addresses it (CAP01).
    async (ctx) => {
      const list = await ctx.json('/api/reviews')
      if (!list) return { skip: noRecord(ctx, '/api/reviews', 'lists nothing') }
      for (const row of rows(list)) {
        const cap = asList(await ctx.json(`/api/reviews/${enc(row.code)}/caps`))[0]
        if (cap) return `/api/reviews/${enc(row.code)}/caps/${capCode(cap.seq)}`
      }
      return { skip: 'no record: no review under GET /api/reviews has a CAP' }
    },
  ],
  ['/api/reviews/:code/attachments', under(review, (code) => `/api/reviews/${code}/attachments`)],
  [
    '/api/reviews/:code/attachments/:id',
    firstFile(
      '/api/reviews',
      rows,
      'code',
      (code) => `/api/reviews/${code}/attachments`,
      (files) => files,
      (code, id) => `/api/reviews/${code}/attachments/${id}`,
    ),
  ],
  ['/api/tasks'],
  ['/api/tasks/accounts'],
  ['/api/tasks/:id', firstOf('/api/tasks', asList, 'id', (id) => `/api/tasks/${id}`)],
  [
    '/api/tasks/:id/attachments/:fileId',
    firstFile(
      '/api/tasks',
      asList,
      'id',
      (id) => `/api/tasks/${id}`,
      (task) => task?.attachments,
      (id, fileId) => `/api/tasks/${id}/attachments/${fileId}`,
    ),
  ],
  ['/api/me/notifications'],
  ['/api/me/notifications/count'],
  ['/api/me/notices/:id', myNotice],
  ['/api/me/tasks'],
  ['/api/me/tasks/:id', firstOf('/api/me/tasks', asList, 'id', (id) => `/api/me/tasks/${id}`)],
  [
    '/api/me/tasks/:id/attachments/:fileId',
    firstFile(
      '/api/me/tasks',
      asList,
      'id',
      (id) => `/api/me/tasks/${id}`,
      (task) => task?.attachments,
      (id, fileId) => `/api/me/tasks/${id}/attachments/${fileId}`,
    ),
  ],
  ['/api/notices'],
  ['/api/asset-types'],
  ['/api/asset-brands'],
  ['/api/digital-asset-types'],
  ['/api/condition-ratings'],
  ['/api/users'],
]

/** priya/GET_api_assets_tag_:tag.json: stable, from the route pattern rather than the ids it was given. */
const fileFor = (user, pattern) => `${user}/GET_${pattern.replace(/^\//, '').replaceAll('/', '_')}.json`

// ---- HTTP --------------------------------------------------------------------------------------------------------------
async function send(urlPath, { method = 'GET', cookie, json } = {}) {
  const headers = {}
  if (cookie) headers.Cookie = cookie
  if (json !== undefined) headers['Content-Type'] = 'application/json'
  const init = { method, headers, redirect: 'manual', signal: AbortSignal.timeout(30_000) }
  if (json !== undefined) init.body = JSON.stringify(json)
  const res = await fetch(BASE + urlPath, init)
  return {
    status: res.status,
    contentType: res.headers.get('content-type'),
    contentDisposition: res.headers.get('content-disposition'),
    setCookies: res.headers.getSetCookie(),
    bytes: Buffer.from(await res.arrayBuffer()),
  }
}

async function signIn(email) {
  const res = await send('/api/auth/login', { method: 'POST', json: { email, password: PASSWORD } })
  if (res.status !== 200) throw new Error(`sign-in as ${email} answered ${res.status}: ${res.bytes.toString('utf8')}`)
  const pair = res.setCookies.map((cookie) => cookie.split(';')[0]).find((cookie) => cookie.startsWith('bphs_session='))
  if (!pair) throw new Error(`sign-in as ${email} set no bphs_session cookie`)
  return { cookie: pair, token: pair.slice('bphs_session='.length) }
}

/** One user's snapshot: raw responses by file name, and the routes left out with the reason. */
async function snapshotUser({ key, email }) {
  const { cookie, token } = await signIn(email)
  const cache = new Map()
  const ctx = {
    cache,
    // Each path is requested once per user: a resolver's lookup and the snapshot of that same path are one response.
    async get(urlPath) {
      if (!cache.has(urlPath)) cache.set(urlPath, await send(urlPath, { cookie }))
      return cache.get(urlPath)
    },
    async json(urlPath) {
      const res = await ctx.get(urlPath)
      if (res.status !== 200 || !/json/i.test(res.contentType ?? '')) return null
      return JSON.parse(res.bytes.toString('utf8'))
    },
  }
  const records = new Map()
  const skipped = {}
  // Lists first, then details: the GETs that write (reading a notice, a logged download) come after every list is taken.
  for (const [pattern] of ROUTES.filter(([, resolve]) => !resolve)) {
    records.set(fileFor(key, pattern), { request: `GET ${String(pattern)}`, ...(await ctx.get(pattern)) })
  }
  for (const [pattern, resolve] of ROUTES.filter(([, resolve]) => resolve)) {
    const found = await resolve(ctx)
    if (typeof found !== 'string') {
      skipped[`GET ${String(pattern)}`] = found.skip
      continue
    }
    records.set(fileFor(key, pattern), { request: `GET ${found}`, ...(await ctx.get(found)) })
  }
  await send('/api/auth/logout', { method: 'POST', cookie, json: {} })
  return { records, skipped, token }
}

// ---- Normalising -------------------------------------------------------------------------------------------------------
/** Plain code-unit order, what a bare sort() does, named so the order is explicit. */
const byCodeUnit = (a, b) => (a < b ? -1 : a > b ? 1 : 0)

const ISO_DATE_TIME = /\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:?\d{2})?/g

function normaliser(windowStart, windowEnd) {
  const inWindow = (ms) => ms >= windowStart && ms <= windowEnd
  const isoMs = (text) => {
    const zoned = /(?:Z|[+-]\d{2}:?\d{2})$/.test(text) ? text : `${text}Z`
    return Date.parse(zoned.replace(' ', 'T'))
  }
  const text = (value) => value.replace(ISO_DATE_TIME, (match) => (inWindow(isoMs(match)) ? PLACEHOLDER : match))
  const value = (v) => {
    if (typeof v === 'number') return Number.isFinite(v) && (inWindow(v) || inWindow(v * 1000)) ? PLACEHOLDER : v
    if (typeof v === 'string') return text(v)
    if (Array.isArray(v)) return v.map(value)
    if (v && typeof v === 'object') {
      return Object.fromEntries(
        Object.keys(v)
          .sort(byCodeUnit)
          .map((k) => [k, value(v[k])]),
      )
    }
    return v
  }
  return { text, value }
}

/** A raw response as its baseline file: JSON with sorted keys, text as lines, bytes as a hash. */
function render(record, norm) {
  const { request, status, contentType, contentDisposition, bytes } = record
  const out = { request, status, contentType }
  if (contentDisposition) out.contentDisposition = contentDisposition
  const type = contentType ?? ''
  let parsed
  if (/json/i.test(type)) {
    try {
      parsed = JSON.parse(bytes.toString('utf8'))
    } catch {
      parsed = undefined
    }
  }
  if (bytes.length === 0) Object.assign(out, { bodyKind: 'empty', body: null })
  else if (parsed !== undefined) Object.assign(out, { bodyKind: 'json', body: norm.value(parsed) })
  else if (/^text\/|json|csv/i.test(type)) {
    // Split on \n only, so a \r stays (and shows) at the end of its line.
    Object.assign(out, { bodyKind: 'text', body: norm.text(bytes.toString('utf8')).split('\n') })
  } else {
    Object.assign(out, {
      bodyKind: 'binary',
      body: { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') },
    })
  }
  // The CSV exports start with a byte-order mark: written as \ufeff so it can be seen, and survives an edit.
  return `${JSON.stringify(out, null, 2).replaceAll('\uFEFF', '\\ufeff')}\n`
}

// ---- Diff --------------------------------------------------------------------------------------------------------------
const CONTEXT = 3

/** The lines of a and b as [' ' | '-' | '+', line] steps: common prefix and suffix, and an LCS of what is between. */
function editSteps(a, b) {
  let head = 0
  while (head < a.length && head < b.length && a[head] === b[head]) head++
  let tail = 0
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++
  const x = a.slice(head, a.length - tail)
  const y = b.slice(head, b.length - tail)
  const middle = []
  if (x.length * y.length > 4_000_000) {
    middle.push(...x.map((line) => ['-', line]), ...y.map((line) => ['+', line]))
  } else {
    const width = y.length + 1
    const lcs = new Uint32Array((x.length + 1) * width)
    for (let i = x.length - 1; i >= 0; i--)
      for (let j = y.length - 1; j >= 0; j--)
        lcs[i * width + j] =
          x[i] === y[j] ? lcs[(i + 1) * width + j + 1] + 1 : Math.max(lcs[(i + 1) * width + j], lcs[i * width + j + 1])
    let i = 0
    let j = 0
    while (i < x.length || j < y.length) {
      if (i < x.length && j < y.length && x[i] === y[j]) {
        middle.push([' ', x[i]])
        i++
        j++
      } else if (i < x.length && (j === y.length || lcs[(i + 1) * width + j] >= lcs[i * width + j + 1]))
        middle.push(['-', x[i++]])
      else middle.push(['+', y[j++]])
    }
  }
  return [
    ...a.slice(0, head).map((line) => [' ', line]),
    ...middle,
    ...a.slice(a.length - tail).map((line) => [' ', line]),
  ]
}

/** A file's lines, without the empty one after its final newline. */
const linesOf = (text) => text.replace(/\n$/, '').split('\n')

function unifiedDiff(name, before, after) {
  const steps = editSteps(linesOf(before), linesOf(after))
  // Line numbers in each side, before each step.
  let [lineA, lineB] = [1, 1]
  const numbered = steps.map(([op, line]) => {
    const at = { op, line, a: lineA, b: lineB }
    if (op !== '+') lineA++
    if (op !== '-') lineB++
    return at
  })
  const changed = numbered.flatMap((step, index) => (step.op === ' ' ? [] : [index]))
  const out = [`--- baseline/${name}`, `+++ fresh/${name}`]
  let k = 0
  while (k < changed.length) {
    const start = Math.max(0, changed[k] - CONTEXT)
    let end = changed[k]
    while (k + 1 < changed.length && changed[k + 1] - end <= 2 * CONTEXT) end = changed[++k]
    k++
    const hunk = numbered.slice(start, Math.min(numbered.length, end + CONTEXT + 1))
    const countA = hunk.filter((s) => s.op !== '+').length
    const countB = hunk.filter((s) => s.op !== '-').length
    out.push(`@@ -${hunk[0].a},${countA} +${hunk[0].b},${countB} @@`, ...hunk.map((s) => `${s.op}${s.line}`))
  }
  return out.join('\n')
}

// ---- Baseline files ----------------------------------------------------------------------------------------------------
function readBaseline() {
  const files = new Map()
  if (!fs.existsSync(BASELINE)) return files
  for (const entry of fs.readdirSync(BASELINE, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue
    const full = path.join(entry.parentPath, entry.name)
    files.set(path.relative(BASELINE, full).split(path.sep).join('/'), fs.readFileSync(full, 'utf8'))
  }
  return files
}

function writeBaseline(files) {
  fs.rmSync(BASELINE, { recursive: true, force: true })
  for (const [name, content] of files) {
    fs.mkdirSync(path.dirname(path.join(BASELINE, name)), { recursive: true })
    fs.writeFileSync(path.join(BASELINE, name), content)
  }
}

// ---- Server ------------------------------------------------------------------------------------------------------------
const SCRATCH = path.join(REPO, 'docs/verify/scratch-server.sh')
const scratch = (command) => spawnSync('bash', [SCRATCH, command], { cwd: REPO, env: SERVER_ENV, encoding: 'utf8' })

function serverLogTail() {
  for (const log of ['server.log', 'seed.log']) {
    const file = path.join(SERVER_ENV.ROOT, log)
    if (fs.existsSync(file))
      console.error(`--- ${file} (last lines)\n${fs.readFileSync(file, 'utf8').split('\n').slice(-25).join('\n')}`)
  }
}

let serverUp = false
function stopServer() {
  if (!serverUp) return
  serverUp = false
  scratch('stop')
}
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    stopServer()
    process.exit(130)
  })
}

// ---- Main --------------------------------------------------------------------------------------------------------------
async function snapshot() {
  const raw = new Map()
  const tokens = []
  for (const user of USERS) {
    const { records, skipped, token } = await snapshotUser(user)
    tokens.push(token)
    for (const [name, record] of records) raw.set(name, record)
    raw.set(`${user.key}/_skipped.json`, { skipped })
  }
  const norm = normaliser(REAL_START - SLACK_MS, realNow() + SLACK_MS)
  const files = new Map()
  for (const [name, record] of [...raw].sort(([a], [b]) => byCodeUnit(a, b))) {
    files.set(name, record.skipped ? `${JSON.stringify(record.skipped, null, 2)}\n` : render(record, norm))
  }
  for (const [name, content] of files) {
    if (tokens.some((token) => content.includes(token))) throw new Error(`${name} contains a session token`)
  }
  return files
}

function summary(files) {
  return USERS.map(({ key }) => {
    const count = [...files.keys()].filter((name) => name.startsWith(`${key}/GET_`)).length
    const skipped = Object.keys(JSON.parse(files.get(`${key}/_skipped.json`) ?? '{}')).length
    return `${key}: ${count} endpoints, ${skipped} skipped`
  }).join('; ')
}

function compare(fresh) {
  const baseline = readBaseline()
  if (baseline.size === 0) {
    console.log(
      `FAIL: no baseline in ${path.relative(REPO, BASELINE)}; record one with node docs/verify/api-snapshot.mjs`,
    )
    return 1
  }
  const names = [...new Set([...baseline.keys(), ...fresh.keys()])].sort(byCodeUnit)
  let [changed, missing, extra] = [0, 0, 0]
  for (const name of names) {
    const [before, after] = [baseline.get(name), fresh.get(name)]
    if (after === undefined) {
      missing++
      console.log(`FAIL: ${name} is in the baseline but was not produced (missing endpoint)`)
    } else if (before === undefined) {
      extra++
      console.log(`FAIL: ${name} was produced but is not in the baseline (extra endpoint)`)
    } else if (before !== after) {
      changed++
      console.log(`FAIL: ${name} differs from the baseline\n${unifiedDiff(name, before, after)}`)
    }
  }
  if (changed + missing + extra === 0) {
    console.log(`PASS: all ${names.length} snapshot files match the baseline (${summary(fresh)})`)
    return 0
  }
  console.log(`FAIL: ${changed} changed, ${missing} missing, ${extra} extra, of ${names.length} snapshot files`)
  return 1
}

let exitCode = 1
try {
  if (OWN_SERVER) {
    const started = scratch('start')
    serverUp = true
    if (started.status !== 0)
      throw new Error(`scratch server did not start: ${(started.stdout + started.stderr).trim()}`)
  }
  const files = await snapshot()
  if (COMPARE) exitCode = compare(files)
  else {
    writeBaseline(files)
    console.log(`Recorded ${files.size} files in ${path.relative(REPO, BASELINE)} (${summary(files)})`)
    exitCode = 0
  }
} catch (error) {
  console.error(`FAIL: ${error.message}`)
  if (OWN_SERVER) serverLogTail()
} finally {
  stopServer()
}
process.exit(exitCode)
