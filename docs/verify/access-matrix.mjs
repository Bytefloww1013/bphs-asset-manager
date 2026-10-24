// Access matrix (issue #23, 0.5): the status every API route answers to every kind of account, recorded from the unchanged
// app so the refactor can prove access did not change. It talks to the app over HTTP only and imports none of its source,
// so it keeps working while server files move into foundation/* and modules/*.
//
//   node docs/verify/access-matrix.mjs            record docs/verify/baseline/access.json (probes, accounts and results)
//   node docs/verify/access-matrix.mjs --compare  replay the stored probes and accounts on a fresh server and diff
//
// Server: unless BASE is set, it starts its own seeded scratch server with docs/verify/scratch-server.sh (ROOT, default
// $BPHS_TMP/bphs-access-matrix; PORT, default 3393; FIXED_NOW=2026-10-01T13:00:00Z; TZ=UTC; SKIP_BUILD=1) and stops it
// at the end, on errors too. With BASE, MATRIX_DATA_DIR must name that server's data folder (see "None" below); it has its own
// name so that an app DATA_DIR exported in the shell, which may be the real one, is never written to.
//
// Accounts (the columns): signed-out (no cookie); super-admin (Priya, the seeded Super Admin); one account per section and
// level, `<section>:<level>`, whose only access is that level in that section (sections and levels as in shared/constants.ts:
// SECTIONS, and levelsFor, where only tasks has assign); and none, with no access at all. Priya makes each of them through
// the Users API, each linked to an employee made for it (an account must be linked to one, and Administrative Reviews treats
// an unlinked account as None). A new account must change its one-time password first: it signs in once, changes the
// password over /api/auth/password-change, which keeps that session, and that cookie is used for all its probes. Nothing
// signs in twice and no password is ever wrong, so the sign-in lockout (5 wrong passwords) is never reached.
// The Users API refuses an account that cannot open any workspace (employees:* alone, and none). Those are made with
// Read in Assets added, and then their access is set to the real one directly in the scratch database (users.access, in
// the scratch server's bphs.sqlite): the only thing done outside HTTP. Every account's access is then checked through /api/auth/me.
//
// Probes (the rows), stored in the baseline so that --compare replays exactly the same ones after the code has moved:
// - Every declared route and method (Hono's app.routes at 944638a: ROUTES=<file> of "METHOD /path" lines; without it,
//   recording again reuses the declared routes already in the baseline). Path params get values that do not exist (999999,
//   ZZZ-9999, an import type of zzz) and every write sends the JSON body {}, so an allowed request ends in 400, 404 or 422
//   and a denied one in 401 or 403, and the data barely changes. The importers check access themselves after the body check,
//   so each import type is also probed with one empty row: it passes the body check and is invalid, so nothing is imported.
// - A made-up path per first path segment under /api, which no route declares: GET and POST /api/<segment>/__undeclared__/x,
//   and GET and POST /api/__undeclared__. Today each follows accessNeeded()'s rule for its prefix, and a prefix with no rule
//   of its own (lookups, webhooks, auth, assets and the rest) falls through to its at('assets').
// - Order: sorted by path, then method; each account runs every probe in that order. Two routes act with no params and no
//   body, so they run last for every account: POST /api/me/notifications/read-all (marks the account's own notifications
//   read; nothing else reads them before the end) and then POST /api/auth/logout, which ends the session it is sent with.
//   Running them last, rather than signed out only, keeps a real cell for every account and every other cell meaningful.
// - Headers: Hono's csrf() (on /api/*) refuses a write whose Content-Type is a form's (urlencoded, multipart, text/plain,
//   or none, which counts as text/plain) unless Sec-Fetch-Site is same-origin or Origin is the server's own. Every write
//   here is application/json, which csrf() does not check, and sends the server's Origin as well, as the app's pages do.
// - A cell is the status, followed by the JSON body's error code when there is one: "200", "403 forbidden", "404 not_found".
//
// Compare: every declared-route cell must match the baseline exactly. A made-up-path cell passes if it matches the baseline
// or is now refused (401, 403 or 404, never 2xx): the route-level declarations of Phase 3 deny an undeclared path by
// default, so a cell that was a 403 from the at('assets') fallback may become a 404, or a 404 a 403. Each such change is
// printed as an INFO line. Exit 0 when everything passes, 1 on any failure.
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** Where scratch files go: `BPHS_TMP`, else the system temp folder. */
const TMP = process.env.BPHS_TMP ?? process.env.TMPDIR ?? '/tmp'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '../..')
const BASELINE = path.join(HERE, 'baseline', 'access.json')
const COMPARE = process.argv.includes('--compare')
const OWN_SERVER = !process.env.BASE
const ROOT = process.env.ROOT ?? `${TMP}/bphs-access-matrix`
const PORT = process.env.PORT ?? '3393'
const FIXED_NOW = '2026-10-01T13:00:00Z'
const BASE = (process.env.BASE ?? `http://localhost:${PORT}`).replace(/\/+$/, '')
const ORIGIN = new URL(BASE).origin
const DATA_DIR = OWN_SERVER ? path.join(ROOT, 'data') : process.env.MATRIX_DATA_DIR

const ADMIN = { email: 'p.raghunathan@bphs.local', password: 'Demo-pass1!' }
const PROBE_PASSWORD = 'Probe-matrix-1!'
// shared/constants.ts: SECTIONS (the five workspaces, then employees) and levelsFor (Assign only in tasks).
const SECTIONS = ['assets', 'grievances', 'maintenance', 'reviews', 'tasks', 'employees']
const WORKSPACES = SECTIONS.slice(0, 5)
const levelsFor = (section) => (section === 'tasks' ? ['read', 'assign', 'edit', 'full'] : ['read', 'edit', 'full'])
// shared/importers.ts: the import types.
const IMPORT_TYPES = ['employees', 'programs']
const PARAMS = { id: '999999', fileId: '999999', code: 'ZZZ-9999', tag: 'ZZZ-9999', cap: 'ZZZ-9999', type: 'zzz' }
const UNDECLARED = '__undeclared__'
const REFUSED = new Set([401, 403, 404])
const LAST = ['POST /api/me/notifications/read-all', 'POST /api/auth/logout']
const METHOD_ORDER = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE']

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0)
const probeId = (probe) => `${probe.method} ${probe.path}`
const isWrite = (method) => method !== 'GET' && method !== 'HEAD'

/** JSON with every object's keys sorted, two-space indents and a trailing newline, so the file only changes when a value does. */
function stableJson(value) {
  const sort = (v) =>
    Array.isArray(v)
      ? v.map(sort)
      : v && typeof v === 'object'
        ? Object.fromEntries(
            Object.keys(v)
              .sort(cmp)
              .map((key) => [key, sort(v[key])]),
          )
        : v
  return `${JSON.stringify(sort(value), null, 2)}\n`
}

// ---- Server ---------------------------------------------------------------------------------
function scratch(action) {
  const result = spawnSync('bash', [path.join(HERE, 'scratch-server.sh'), action], {
    cwd: REPO,
    env: { ...process.env, ROOT, PORT, FIXED_NOW, TZ: 'UTC', SKIP_BUILD: '1' },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (result.status !== 0)
    throw new Error(`scratch-server.sh ${action} failed: ${`${result.stdout}${result.stderr}`.trim()}`)
}

let serverUp = false
function stopServer() {
  if (!serverUp) return
  serverUp = false
  try {
    scratch('stop')
  } catch (error) {
    console.error(`WARN: ${error.message}`)
  }
}
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    stopServer()
    process.exit(130)
  })

// ---- HTTP -----------------------------------------------------------------------------------
async function request(method, urlPath, { cookie, body } = {}) {
  const headers = { Accept: 'application/json' }
  if (cookie) headers.Cookie = cookie
  const init = { method, headers, redirect: 'manual', signal: AbortSignal.timeout(15_000) }
  if (isWrite(method)) {
    headers['Content-Type'] = 'application/json'
    headers.Origin = ORIGIN
    init.body = JSON.stringify(body ?? {})
  }
  const res = await fetch(`${BASE}${urlPath}`, init)
  const text = await res.text()
  let json
  try {
    json = text ? JSON.parse(text) : undefined
  } catch {
    json = undefined // a CSV, a file or csrf()'s plain "Forbidden": the status says enough
  }
  return { res, json }
}

/** One request that has to work while the accounts are set up. */
async function must(method, urlPath, options, expected) {
  const { res, json } = await request(method, urlPath, options)
  if (res.status !== expected)
    throw new Error(`${method} ${urlPath} answered ${res.status}, not ${expected}: ${JSON.stringify(json)}`)
  return { res, json }
}

const cookieOf = (res) =>
  res.headers
    .getSetCookie()
    .map((line) => line.split(';')[0])
    .join('; ')

async function signIn(email, password) {
  const { res, json } = await must('POST', '/api/auth/login', { body: { email, password } }, 200)
  const cookie = cookieOf(res)
  if (!cookie) throw new Error(`signing in as ${email} set no cookie`)
  return { cookie, user: json.user }
}

// ---- Accounts -------------------------------------------------------------------------------
function accountList() {
  const perLevel = SECTIONS.flatMap((section) =>
    levelsFor(section).map((level) => ({ id: `${section}:${level}`, access: { [section]: level } })),
  )
  return [{ id: 'signed-out' }, { id: 'super-admin', superAdmin: true }, ...perLevel, { id: 'none', access: {} }]
}

const sameAccess = (a, b) => stableJson(a ?? {}) === stableJson(b ?? {})

/** Signs every account in once. Returns the cookie of each signed-in column (signed-out has none). */
async function setUpAccounts(accounts) {
  const admin = await signIn(ADMIN.email, ADMIN.password)
  if (!admin.user.superAdmin) throw new Error(`${ADMIN.email} is not a Super Admin`)
  const cookies = { 'super-admin': admin.cookie }
  const patches = []
  let n = 0
  for (const account of accounts) {
    if (account.id === 'signed-out' || account.superAdmin) continue
    n += 1
    const slug = account.id.replace(':', '-')
    const { json: employee } = await must(
      'POST',
      '/api/employees',
      {
        cookie: admin.cookie,
        body: { code: `PROBE-${String(n).padStart(2, '0')}`, firstName: 'Probe', lastName: slug },
      },
      201,
    )
    const user = {
      name: `Probe ${slug}`,
      email: `probe-${slug}@bphs.local`,
      superAdmin: false,
      employeeId: employee.id,
    }
    let created = await request('POST', '/api/users', {
      cookie: admin.cookie,
      body: { ...user, access: account.access },
    })
    // The Users API refuses an account that cannot open any workspace: see the header.
    if (created.res.status === 422 && created.json?.details?.fields?.access) {
      const opener = WORKSPACES.some((w) => account.access[w]) ? {} : { assets: 'read' }
      created = await request('POST', '/api/users', {
        cookie: admin.cookie,
        body: { ...user, access: { ...account.access, ...opener } },
      })
      patches.push({ id: created.json?.user?.id, access: account.access })
    }
    if (created.res.status !== 201)
      throw new Error(`creating ${account.id} answered ${created.res.status}: ${JSON.stringify(created.json)}`)
    const session = await signIn(user.email, created.json.oneTimePassword)
    await must(
      'POST',
      '/api/auth/password-change',
      { cookie: session.cookie, body: { currentPassword: created.json.oneTimePassword, newPassword: PROBE_PASSWORD } },
      200,
    )
    cookies[account.id] = session.cookie
  }
  if (patches.length) await patchAccess(patches)
  for (const account of accounts) {
    if (!cookies[account.id]) continue
    const { json } = await must('GET', '/api/auth/me', { cookie: cookies[account.id] }, 200)
    const want = account.superAdmin ? json.user.superAdmin === true : sameAccess(json.user.access, account.access)
    if (!want || json.user.mustChangePassword)
      throw new Error(`${account.id} is not set up as expected: ${JSON.stringify(json.user)}`)
  }
  return cookies
}

/** Sets users.access in the scratch database, for the accounts the Users API will not make. */
async function patchAccess(patches) {
  if (!DATA_DIR) throw new Error('BASE is set without MATRIX_DATA_DIR: the none and employees:* accounts need its database')
  const file = path.join(DATA_DIR, 'bphs.sqlite')
  if (!fs.existsSync(file)) throw new Error(`no database at ${file}`)
  const { DatabaseSync } = await import('node:sqlite')
  const db = new DatabaseSync(file)
  try {
    db.exec('PRAGMA busy_timeout = 5000')
    const update = db.prepare('UPDATE users SET access = ? WHERE id = ?')
    for (const { id, access } of patches) {
      if (update.run(JSON.stringify(access), id).changes !== 1)
        throw new Error(`could not set the access of user ${id}`)
    }
  } finally {
    db.close()
  }
}

// ---- Probes ---------------------------------------------------------------------------------
const routeRegex = (route) => new RegExp(`^${route.replace(/[.]/g, '\\.').replace(/:\w+/g, '[^/]+')}$`)
const fill = (route) => route.replace(/:(\w+)/g, (_, name) => PARAMS[name] ?? '999999')

function readRoutes(baseline) {
  if (process.env.ROUTES) {
    return fs
      .readFileSync(process.env.ROUTES, 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [method, route, extra] = line.split(/\s+/)
        if (!method || !route?.startsWith('/') || extra) throw new Error(`ROUTES: not "METHOD /path": ${line}`)
        return { method, route }
      })
  }
  if (!baseline) throw new Error('no baseline yet: set ROUTES to a file of "METHOD /path" lines (Hono app.routes)')
  return baseline.probes.filter((p) => p.kind === 'declared').map(({ method, route }) => ({ method, route }))
}

function buildProbes(routes) {
  const unique = new Map(routes.map((r) => [`${r.method} ${r.route}`, r]))
  const probes = []
  for (const { method, route } of unique.values()) {
    probes.push({ kind: 'declared', method, route, path: fill(route), ...(isWrite(method) ? { body: {} } : {}) })
    if (method === 'POST' && /^\/api\/import\/:type(\/preview)?$/.test(route)) {
      for (const type of IMPORT_TYPES)
        probes.push({
          kind: 'declared',
          method,
          route,
          path: route.replace(':type', type),
          body: { rows: [{ row: 1, values: {} }] },
        })
    }
  }
  const segments = [...new Set([...unique.values()].map((r) => r.route.split('/')[2]).filter(Boolean))].sort(cmp)
  const madeUp = [...segments.map((s) => `/api/${s}/${UNDECLARED}/x`), `/api/${UNDECLARED}`]
  const patterns = [...unique.values()].map((r) => ({ ...r, regex: routeRegex(r.route) }))
  for (const urlPath of madeUp) {
    for (const method of ['GET', 'POST']) {
      const clash = patterns.find((r) => r.method === method && r.regex.test(urlPath))
      if (clash) throw new Error(`${method} ${urlPath} is declared by ${clash.route}`)
      const prefix = urlPath === `/api/${UNDECLARED}` ? '/api' : urlPath.split('/').slice(0, 3).join('/')
      probes.push({ kind: 'undeclared', method, prefix, path: urlPath, ...(isWrite(method) ? { body: {} } : {}) })
    }
  }
  const seen = new Set()
  for (const probe of probes) {
    if (seen.has(probeId(probe))) throw new Error(`two probes are ${probeId(probe)}`)
    seen.add(probeId(probe))
  }
  const rank = (probe) => {
    const last = LAST.indexOf(`${probe.method} ${probe.route ?? ''}`)
    return last === -1 ? -1 : last
  }
  return probes.sort(
    (a, b) =>
      rank(a) - rank(b) ||
      cmp(a.path, b.path) ||
      METHOD_ORDER.indexOf(a.method) - METHOD_ORDER.indexOf(b.method) ||
      cmp(a.method, b.method),
  )
}

async function probeCell(probe, cookie) {
  const { res, json } = await request(probe.method, probe.path, { cookie, body: probe.body })
  const code = res.status >= 400 && typeof json?.error === 'string' ? json.error : ''
  return code ? `${res.status} ${code}` : String(res.status)
}

async function runMatrix(accounts, probes) {
  const cookies = await setUpAccounts(accounts)
  const results = Object.fromEntries(probes.map((probe) => [probeId(probe), {}]))
  for (const account of accounts) {
    for (const probe of probes) results[probeId(probe)][account.id] = await probeCell(probe, cookies[account.id])
  }
  return results
}

// ---- Compare --------------------------------------------------------------------------------
const statusOf = (cell) => Number(String(cell).split(' ')[0])

function compare(baseline, results) {
  const failed = []
  const info = []
  let declared = 0
  let undeclared = 0
  for (const probe of baseline.probes) {
    for (const account of baseline.accounts) {
      const was = probe.results?.[account.id]
      const now = results[probeId(probe)][account.id]
      if (probe.kind === 'declared') declared += 1
      else undeclared += 1
      if (was === now) continue
      const line = `${probeId(probe)}  x  ${account.id}: ${was ?? '(none)'} -> ${now}`
      if (probe.kind === 'undeclared' && REFUSED.has(statusOf(now))) info.push(line)
      else failed.push({ kind: probe.kind, line })
    }
  }
  const failedDeclared = failed.filter((f) => f.kind === 'declared')
  const failedUndeclared = failed.filter((f) => f.kind === 'undeclared')
  const cells = (n) => `${n} cell${n === 1 ? '' : 's'}`
  if (failedDeclared.length) {
    console.log(`FAIL: declared routes: ${cells(failedDeclared.length)} of ${declared} changed (baseline -> now)`)
    for (const f of failedDeclared) console.log(`  ${f.line}`)
  } else console.log(`PASS: declared routes: all ${cells(declared)} match the baseline`)
  for (const line of info) console.log(`INFO: undeclared path now refused: ${line}`)
  if (failedUndeclared.length) {
    console.log(
      `FAIL: made-up paths: ${cells(failedUndeclared.length)} of ${undeclared} changed to something other than 401, 403 or 404`,
    )
    for (const f of failedUndeclared) console.log(`  ${f.line}`)
  } else
    console.log(
      `PASS: made-up paths: all ${cells(undeclared)} match the baseline or are refused (${info.length} changed, see INFO)`,
    )
  return failed.length === 0
}

// ---- Main -----------------------------------------------------------------------------------
const started = Date.now()
const baseline = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')) : null
try {
  if (COMPARE && !baseline) throw new Error(`no baseline at ${path.relative(REPO, BASELINE)}: record one first`)
  const accounts = COMPARE ? baseline.accounts : accountList()
  const probes = COMPARE ? baseline.probes : buildProbes(readRoutes(baseline))
  if (OWN_SERVER) {
    serverUp = true
    scratch('start')
  }
  const results = await runMatrix(accounts, probes)
  const seconds = ((Date.now() - started) / 1000).toFixed(1)
  const size = `${probes.length} probes x ${accounts.length} accounts`
  if (COMPARE) {
    const ok = compare(baseline, results)
    console.log(`${ok ? 'PASS' : 'FAIL'}: access matrix, ${size}, ${seconds}s`)
    process.exitCode = ok ? 0 : 1
  } else {
    fs.mkdirSync(path.dirname(BASELINE), { recursive: true })
    const stored = {
      about:
        'Status (and JSON error code) per probe and account from docs/verify/access-matrix.mjs; see its header. ' +
        `Recorded on a scratch server seeded at ${FIXED_NOW}.`,
      accounts,
      probes: probes.map((probe) => ({ ...probe, results: results[probeId(probe)] })),
    }
    fs.writeFileSync(BASELINE, stableJson(stored))
    console.log(`PASS: recorded ${size} in ${path.relative(REPO, BASELINE)}, ${seconds}s`)
  }
} catch (error) {
  console.log(`FAIL: ${error.message}`)
  process.exitCode = 1
} finally {
  stopServer()
}
