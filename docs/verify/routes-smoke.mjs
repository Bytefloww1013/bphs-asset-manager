// Routes smoke (issue #23, slice 0.3): the behaviour-neutral guard for the modular-architecture refactor.
// It opens every route in the app's route tree, by URL only, as Priya (Super Admin) and Marcus (Admin without Maintenance),
// in headless Chrome against a seeded scratch server with a frozen clock, and checks each page opens as it does today: no
// console or page error, no error boundary, no not-found page, no blank main region, and the expected no-access state or
// redirect where the account may not go. Route files and server code move during the refactor; URLs do not. The one source
// file it reads is web/src/routeTree.gen.ts, as text, so that a route added later must be added to ROUTES below.
//
// Run:  SKIP_BUILD=1 node docs/verify/routes-smoke.mjs     (drop SKIP_BUILD=1 to build the SPA first)
//       BASE=http://localhost:3388 node docs/verify/routes-smoke.mjs     (a seeded server already running; none is started)
// Env:  PORT (3391), ROOT (the scratch folder), CHROME (the browser), ROUTE_TREE (the generated tree), EXTRA_ROUTES (below).
// One PASS/FAIL line per check, then a summary; exit 1 if any check fails.
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer-core'

/** Where scratch files go: `BPHS_TMP`, else the system temp folder. */
const TMP = process.env.BPHS_TMP ?? process.env.TMPDIR ?? '/tmp'

const REPO = fileURLToPath(new URL('../..', import.meta.url))
const CHROME = process.env.CHROME ?? `${TMP}/bphs-spike-chrome/chrome/linux-155.0.8059.39/chrome-linux64/chrome`
const TREE = process.env.ROUTE_TREE ?? `${REPO}web/src/routeTree.gen.ts`
const PORT = process.env.PORT ?? '3391'
const OWN_SERVER = !process.env.BASE
const BASE = (process.env.BASE ?? `http://localhost:${PORT}`).replace(/\/$/, '')
const SERVER_ENV = {
  ...process.env,
  ROOT: process.env.ROOT ?? `${TMP}/bphs-routes-smoke`,
  PORT,
  FIXED_NOW: '2026-10-01T13:00:00Z',
  TZ: 'UTC',
  SKIP_BUILD: process.env.SKIP_BUILD ?? '0',
}
const PASSWORD = 'Demo-pass1!'
const USERS = { priya: 'p.raghunathan@bphs.local', marcus: 'm.oyelaran@bphs.local' }
const DESKTOP = { width: 1440, height: 900 }

/**
 * Every full path in the route tree, as TanStack writes it (an index route ends in a slash), and the address it is opened at.
 * With no address the path is the address. `{name}` is a seeded record, looked up from the API as each user (see records()).
 */
const ROUTES = [
  ['/'],
  ['/login'],
  ['/password-change'],
  ['/assets/'],
  ['/assets/$tag', '/assets/{asset}'],
  ['/assignments'],
  ['/available'],
  ['/digital-assets'],
  ['/programs'],
  ['/lists'],
  ['/import-export'],
  ['/audit'],
  ['/users'],
  ['/employees/'],
  ['/employees/import'],
  ['/maintenance'],
  ['/maintenance/'],
  ['/maintenance/new'],
  ['/maintenance/$id', '/maintenance/{maintenance}'],
  ['/grievances'],
  ['/grievances/'],
  ['/grievances/new'],
  ['/grievances/audit'],
  ['/grievances/categories'],
  ['/grievances/employees'],
  ['/grievances/$code/', '/grievances/{grievance}'],
  ['/grievances/$code/edit', '/grievances/{grievance}/edit'],
  ['/grievances/$code/versions', '/grievances/{grievance}/versions'],
  ['/grievances/$code/entries/new', '/grievances/{grievance}/entries/new'],
  ['/grievances/$code/entries/$seq', '/grievances/{grievance}/entries/{entry}'],
  ['/grievances/$code/case-file', '/grievances/{grievance}/case-file'],
  ['/reviews'],
  ['/reviews/'],
  ['/reviews/new'],
  ['/reviews/actions'],
  ['/reviews/audit'],
  ['/reviews/employees'],
  ['/reviews/$code/', '/reviews/{review}'],
  ['/reviews/$code/edit', '/reviews/{review}/edit'],
  ['/reviews/$code/entries/new', '/reviews/{review}/entries/new'],
  ['/reviews/$code/caps/new', '/reviews/{review}/caps/new'],
  ['/reviews/$code/caps/$cap/', '/reviews/{capReview}/caps/{cap}'],
  ['/reviews/$code/caps/$cap/edit', '/reviews/{capReview}/caps/{cap}/edit'],
  ['/reviews/$code/case-file', '/reviews/{review}/case-file'],
  ['/tasks'],
  ['/tasks/'],
  ['/tasks/new'],
  ['/tasks/$id/', '/tasks/{task}'],
  ['/tasks/$id/edit', '/tasks/{task}/edit'],
  ['/me'],
  ['/me/'],
  ['/me/inbox'],
  ['/me/inbox/$noticeId', '/me/inbox/{notice}'],
  ['/me/notices'],
  ['/me/profile'],
  ['/me/tasks'],
  ['/me/tasks/$id', '/me/tasks/{myTask}'],
]

/**
 * Where a page does not simply open as itself, what each account is expected to get instead: `redirect` is the address it
 * must land on (which must then open cleanly), `shows` a state it must show, `standalone` that it is drawn without the app
 * shell, and `allow` the console errors that state brings (a failed request the page answers on screen). Anything not listed must open at its own address.
 */
const COMMON = {
  '/login': { redirect: '/' }, // Signed in, the sign-in page sends you on.
  '/me': { redirect: '/me/inbox' },
  '/me/': { redirect: '/me/inbox' },
  '/employees/import': { redirect: '/import-export?type=employees' }, // The old address of the employee import.
}
/** A page the account's access doesn't allow: the root not-found page, which has no app shell (issue #27). */
const NOT_FOUND = { shows: "That page doesn't exist", standalone: true }
const EXPECT = {
  priya: {
    ...COMMON,
    // The seed sends Priya no task, so her My Space task page is opened with the first workspace task, someone else's. Its
    // loader's 404 is also logged by the router ("Task not found.") before the route's errorComponent shows it.
    '/me/tasks/$id': { shows: 'No task of yours with that ID', allow: /status of 404|: Task not found\./ },
    // The notice is Priya's own, and a notice never goes to its sender (notify() drops the actor).
    '/me/inbox/$noticeId': { shows: 'This notice is not in your Inbox', allow: /status of 404/ },
  },
  marcus: {
    ...COMMON,
    // No Maintenance access: requireSession() sends him to the home of his first workspace, Assets.
    '/maintenance': { redirect: '/' },
    '/maintenance/': { redirect: '/' },
    '/maintenance/new': { redirect: '/' },
    '/maintenance/$id': { redirect: '/' },
    // Super Admin only: the page is not found, drawn outside the app shell (issue #27).
    '/users': NOT_FOUND,
    '/me/notices': NOT_FOUND,
  },
}

/**
 * Routes for this run only, as JSON `[[path, address | null, { priya?, marcus? }], ...]`: the throwaway module's pages that
 * docs/verify/new-module-proof.sh passes in, so that the list above never names them.
 */
for (const [path, address, expect = {}] of JSON.parse(process.env.EXTRA_ROUTES ?? '[]')) {
  ROUTES.push(address ? [path, address] : [path])
  for (const user of Object.keys(EXPECT)) if (expect[user]) EXPECT[user][path] = expect[user]
}

/** Signed out: the sign-in page opens, and the password page asks you to sign in first. Both fetch the missing session (a 401). */
const SIGNED_OUT = [
  ['/login', { allow: /status of 401/ }],
  ['/password-change', { redirect: '/login?redirect=%2Fpassword-change', allow: /status of 401/ }],
]

/** Lines of page text that mean the page broke: the error boundary, the not-found page, or a record page that could not load. */
const BROKEN = [
  /^Something went wrong$/,
  /^That page doesn't exist$/,
  /^No .+ with that (ID|tag|number)$/,
  /^Could not load this \w+$/,
  /^This notice is not in your Inbox$/,
  /^The notice could not be loaded$/,
]
/** Pages drawn outside the app shell, so without its #main. */
const STANDALONE = /^\/(login|password-change)(\?|$)|\/case-file$/

let checks = 0
let failed = 0
const perUser = {}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const firstLine = (error) => String(error?.message ?? error).split('\n')[0]

function report(ok, name, why) {
  checks++
  if (!ok) failed++
  console.log(ok ? `PASS: ${name}` : `FAIL: ${name} - ${why}`)
}

function server(command) {
  const run = spawnSync(`${REPO}docs/verify/scratch-server.sh`, [command], { env: SERVER_ENV, encoding: 'utf8' })
  const said = `${run.stdout ?? ''}${run.stderr ?? ''}`.trim()
  if (run.status !== 0) throw new Error(`scratch-server.sh ${command} failed: ${said || run.error?.message}`)
  return said
}

/** The route tree's full paths against ROUTES: a route added to the app must be added here, and one listed here must still exist. */
function checkCoverage() {
  let paths = []
  try {
    const block = /export interface FileRoutesByFullPath \{([^}]*)\}/.exec(readFileSync(TREE, 'utf8'))?.[1] ?? ''
    paths = [...block.matchAll(/^\s*'([^']+)':/gm)].map((match) => match[1])
  } catch (error) {
    return report(false, 'route coverage', `cannot read ${TREE}: ${firstLine(error)}`)
  }
  const listed = new Set(ROUTES.map(([path]) => path))
  const missing = paths.filter((path) => !listed.has(path))
  const gone = [...listed].filter((path) => !paths.includes(path))
  if (paths.length === 0) return report(false, 'route coverage', `no FileRoutesByFullPath paths found in ${TREE}`)
  report(
    missing.length === 0 && gone.length === 0,
    `route coverage: all ${paths.length} route-tree paths are in the smoke`,
    [
      missing.length && `not in ROUTES: ${missing.join(', ')}`,
      gone.length && `not in the route tree: ${gone.join(', ')}`,
    ]
      .filter(Boolean)
      .join('; '),
  )
}

/** A page with its own log of console and page errors, cleared at each visit. */
async function newPage(browser) {
  const page = await (await browser.createBrowserContext()).newPage()
  await page.setViewport(DESKTOP)
  const log = []
  page.on('console', (msg) => {
    if (msg.type() === 'error')
      log.push(`console: ${msg.text()}${msg.location()?.url ? ` (${msg.location().url})` : ''}`)
  })
  page.on('pageerror', (error) => log.push(`page error: ${firstLine(error)}`))
  return { page, log }
}

async function signIn(browser, email) {
  const tab = await newPage(browser)
  await tab.page.goto(`${BASE}/login`)
  await tab.page.locator('::-p-aria(Email)').fill(email)
  await tab.page.locator('::-p-aria(Password)').fill(PASSWORD)
  // "Remember me" stays unticked: with the server clock frozen in the past, that cookie would expire as it is set.
  await tab.page.locator('button[type=submit]').click()
  await tab.page.waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: 10_000 })
  await sleep(1500) // the SPA's own redirect aborts an early goto
  return tab
}

/** GET or POST the API as the signed-in user of this page. Null when the answer is not OK. */
const callApi = (page, path, body) =>
  page.evaluate(
    async (path, body) => {
      const init = body
        ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
        : {}
      const response = await fetch(`/api${path}`, init)
      return response.ok ? response.json() : null
    },
    path,
    body,
  )

/**
 * The seed has no maintenance request and no notice, so Priya makes one of each when there is none (a fresh scratch server
 * always has none, so the ids are the same every run). Marcus may not list either, so both users open these two.
 */
async function sharedRecords(page) {
  if ((await callApi(page, '/maintenance'))?.length === 0)
    await callApi(page, '/maintenance', {
      firstName: 'Routes',
      lastName: 'Smoke',
      location: 'Front office',
      description: 'A request for the routes smoke to open: the seed has none.',
    })
  if ((await callApi(page, '/notices'))?.length === 0)
    await callApi(page, '/notices', {
      title: 'Routes smoke notice',
      body: 'A notice for the routes smoke to open: the seed has none.',
      audience: 'all',
    })
  const maintenance = (await callApi(page, '/maintenance'))?.[0]?.id
  const notice = (await callApi(page, '/notices'))?.[0]?.id
  if (!maintenance || !notice) throw new Error('could not make or find a maintenance request and a notice')
  return { maintenance, notice }
}

/** One record per detail page, the first of each list this user sees, so the choice is the same every run. */
async function records(page, shared) {
  const get = (path) => callApi(page, path)
  const asset = (await get('/assets'))?.[0]?.tag
  const digital = (await get('/digital-assets'))?.[0]?.code
  const grievance = (await get('/grievances'))?.rows?.[0]?.code
  const entry = grievance && (await get(`/grievances/${grievance}/entries`))?.[0]?.seq
  const reviews = (await get('/reviews'))?.rows ?? []
  const review = reviews[0]?.code
  let capReview
  let cap
  // The first review in the list may have no CAP yet: the CAP pages take the first review that has one.
  for (const { code } of reviews) {
    cap = (await get(`/reviews/${code}/caps`))?.[0]?.seq
    if (cap) {
      capReview = code
      break
    }
  }
  const task = (await get('/tasks'))?.[0]?.id
  // A user with no task of their own (Priya, in the seed) opens the first workspace task instead: see EXPECT.
  const myTask = (await get('/me/tasks'))?.[0]?.id ?? task
  const found = { asset, digital, grievance, entry, review, capReview, cap, task, myTask, ...shared }
  const none = Object.keys(found).filter((key) => found[key] === undefined || found[key] === null)
  if (none.length) throw new Error(`no seeded record for: ${none.join(', ')}`)
  return found
}

const addressOf = (path, template, found) =>
  (template ?? (path.length > 1 ? path.replace(/\/$/, '') : path)).replace(/\{(\w+)\}/g, (_, key) => found[key])

/** Open an address and wait until it has settled: network quiet, something drawn, no spinner or skeleton in the main region. */
async function open({ page, log }, address) {
  // The front page reopens the workspace used last (workspaceToReopen()); forget it, so "/" lands on "/" whatever came before.
  await page.evaluate(() => localStorage.removeItem('bphs.workspace')).catch(() => undefined)
  log.length = 0
  await page.goto(`${BASE}${address}`, { waitUntil: 'load', timeout: 20_000 })
  await page.waitForNetworkIdle({ idleTime: 250, timeout: 10_000 }).catch(() => undefined)
  await page
    .waitForFunction(
      () => {
        const region = document.querySelector('#main') ?? document.querySelector('main') ?? document.body
        return region.innerText.trim() !== '' && !region.querySelector('[aria-label="Loading"], .animate-pulse-soft')
      },
      { timeout: 10_000, polling: 100 },
    )
    .catch(() => undefined)
  await sleep(300) // late errors and redirects
  return page.evaluate(() => {
    const main = document.querySelector('#main')
    const region = main ?? document.querySelector('main') ?? document.body
    return {
      at: location.pathname + location.search,
      shell: main !== null,
      text: region.innerText.trim(),
      lines: document.body.innerText.split('\n').map((line) => line.trim()),
      loading: region.querySelector('[aria-label="Loading"], .animate-pulse-soft') !== null,
    }
  })
}

/** What is wrong with a page as opened, against what was expected of it; empty when nothing is. */
function problemsOf(seen, log, address, expected = {}) {
  const problems = []
  const want = expected.redirect ?? address
  if (seen.at !== want) problems.push(`landed on ${seen.at}, expected ${want}`)
  const errors = log.filter((line) => !expected.allow?.test(line))
  if (errors.length) problems.push(`${errors.length} error(s): ${errors.slice(0, 3).join(' | ')}`)
  const broken = seen.lines.filter((line) => line !== expected.shows && BROKEN.some((pattern) => pattern.test(line)))
  if (broken.length) problems.push(`shows "${broken[0]}"`)
  if (expected.shows && !seen.lines.includes(expected.shows)) problems.push(`does not show "${expected.shows}"`)
  if (!STANDALONE.test(seen.at) && !expected.standalone && !seen.shell) problems.push('no app shell (#main)')
  if (!seen.text) problems.push('blank main region')
  if (seen.loading) problems.push('still loading after 10s')
  return problems
}

async function check(tab, name, address, expected, extra) {
  try {
    const seen = await open(tab, address)
    const problems = problemsOf(seen, tab.log, address, expected)
    if (extra) problems.push(...extra(seen))
    const outcome = expected?.redirect ? ` -> ${seen.at}` : expected?.shows ? ` (shows "${expected.shows}")` : ''
    report(problems.length === 0, `${name}: ${address}${outcome}`, problems.join('; '))
  } catch (error) {
    report(false, `${name}: ${address}`, firstLine(error))
  }
}

/** The digital asset detail has no address: it is the Assignment history sheet, opened from the row's menu. */
async function checkDigitalDetail(tab, user, code) {
  const name = `${user} digital asset ${code}: Assignment history sheet`
  try {
    await open(tab, '/digital-assets')
    await tab.page.locator(`::-p-aria([name="More actions for ${code}"][role="button"])`).click()
    await tab.page.locator('::-p-aria([name="Assignment history"][role="menuitem"])').click()
    await tab.page.waitForFunction(
      (code) => [...document.querySelectorAll('[role=dialog]')].some((dialog) => dialog.textContent.includes(code)),
      { timeout: 5000 },
      code,
    )
    await tab.page.waitForNetworkIdle({ idleTime: 250, timeout: 5000 }).catch(() => undefined)
    await sleep(300)
    report(tab.log.length === 0, name, `${tab.log.length} error(s): ${tab.log.slice(0, 3).join(' | ')}`)
  } catch (error) {
    report(false, name, firstLine(error))
  }
}

let browser
let started = false
const stopServer = () => {
  if (!started) return
  started = false
  try {
    server('stop')
  } catch (error) {
    console.log(`FAIL: stop the scratch server - ${firstLine(error)}`)
    failed++
  }
}
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    stopServer()
    process.exit(130)
  })

try {
  checkCoverage()
  if (OWN_SERVER) {
    started = true
    server('start')
  }
  browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    // GitHub's Ubuntu runners need it (CI), and so does this machine: Ubuntu 23.10+ restricts the user namespaces Chrome's
    // sandbox uses ("No usable sandbox!"). The browser only ever opens the local scratch server.
    args: ['--no-sandbox'],
    env: { ...process.env, TZ: 'UTC' },
  })

  const anonymous = await newPage(browser)
  for (const [address, expected] of SIGNED_OUT) await check(anonymous, 'signed out', address, expected)
  await anonymous.page.browserContext().close()

  let shared
  for (const [user, email] of Object.entries(USERS)) {
    const before = { checks, failed }
    let tab
    try {
      tab = await signIn(browser, email)
      shared ??= await sharedRecords(tab.page)
      const found = await records(tab.page, shared)
      for (const [path, template] of ROUTES) {
        const address = addressOf(path, template, found)
        // A printout is outside the app shell: its record's code is what shows it opened.
        const extra = path.endsWith('/case-file')
          ? (seen) =>
              seen.lines.some((line) => line.includes(address.split('/')[2]))
                ? []
                : ['the printout does not show its code']
          : undefined
        await check(tab, `${user} ${path}`, address, EXPECT[user][path], extra)
      }
      await checkDigitalDetail(tab, user, found.digital)
    } catch (error) {
      report(false, `${user}: sign in and find the seeded records`, firstLine(error))
    }
    perUser[user] = { checks: checks - before.checks, failed: failed - before.failed }
    await tab?.page.browserContext().close()
  }
} catch (error) {
  failed++
  console.log(`FAIL: smoke could not run - ${firstLine(error)}`)
} finally {
  await browser?.close().catch(() => undefined)
  stopServer()
}

const users = Object.entries(perUser).map(([user, n]) => `${user} ${n.checks - n.failed}/${n.checks}`)
console.log(`Per user (passed/checks): ${users.join(', ') || 'none ran'}`)
console.log(failed ? `ROUTES SMOKE: FAIL (${failed} of ${checks} checks)` : `ROUTES SMOKE: PASS (${checks} checks)`)
process.exitCode = failed ? 1 : 0
