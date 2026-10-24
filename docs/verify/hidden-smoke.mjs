// Hidden-controls smoke (issue #27): what an account's access doesn't allow is not drawn at all, never shown disabled with the
// missing access as its reason (docs/directives/ui-rules.md, "Permissions and state").
// In headless Chrome against a seeded scratch server, as Marcus (Admin) and as a read-only account Priya makes for the run, it
// opens every page in the route tree, reads the reason of every disabled control (a button or switch's tooltip, a sidebar
// entry's words) and of every disabled item in the page's first row menus, and fails on a reason that names missing access.
// Disabled controls whose reason is a record rule ("Has assignment history.") or a placeholder ("Coming later") pass. It also
// checks that the pages the read-only account may not use are not found, and that My Dashboard still says "Coming later".
//
// Run:  SKIP_BUILD=1 node docs/verify/hidden-smoke.mjs     (drop SKIP_BUILD=1 to build the SPA first)
// Env:  PORT (3394), ROOT (the scratch folder), CHROME (the browser), ROUTE_TREE (the generated tree), MENUS (row menus per page, 3).
// One PASS/FAIL line per page and check, then a summary; exit 1 if any check fails.
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer-core'

/** Where scratch files go: `BPHS_TMP`, else the system temp folder. */
const TMP = process.env.BPHS_TMP ?? process.env.TMPDIR ?? '/tmp'

const REPO = fileURLToPath(new URL('../..', import.meta.url))
const CHROME = process.env.CHROME ?? `${TMP}/bphs-spike-chrome/chrome/linux-155.0.8059.39/chrome-linux64/chrome`
const TREE = process.env.ROUTE_TREE ?? `${REPO}web/src/routeTree.gen.ts`
const PORT = process.env.PORT ?? '3394'
const BASE = `http://localhost:${PORT}`
const MENUS = Number(process.env.MENUS ?? 3)
const SERVER_ENV = {
  ...process.env,
  ROOT: process.env.ROOT ?? `${TMP}/bphs-hidden-smoke`,
  PORT,
  FIXED_NOW: '2026-10-01T13:00:00Z',
  TZ: 'UTC',
  SKIP_BUILD: process.env.SKIP_BUILD ?? '0',
}
const PASSWORD = 'Demo-pass1!'
const PRIYA = 'p.raghunathan@bphs.local'
const MARCUS = 'm.oyelaran@bphs.local'
const READER = 'hidden.smoke@bphs.local'
const READ_ONLY = { assets: 'read', employees: 'read', maintenance: 'read', grievances: 'read', reviews: 'read', tasks: 'read' }

/** A reason that names missing access: the old `needsAccess` and manage/edit/approve wording, and the old lock screens. */
const PERMISSION =
  /access to |Super Admin only|Needs \w+ access|Only its assigner|Only the owner|Only the reviewer|Only whoever added it|A Super Admin assigned this task/i

/** Pages the read-only account must find missing: each needs more than Read. */
const NOT_FOUND_FOR_READER = ['/users', '/me/notices', '/tasks/new', '/grievances/new', '/reviews/new', '/maintenance/new']

/** Route-tree paths not opened: outside the app shell, or the sign-in pages. */
const SKIP = /^\/(login|password-change)$|\/case-file$|^\/employees\/import$/

let checks = 0
let failed = 0
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
}

/** Every full path in the route tree (an index route ends in a slash), each once. */
function routePaths() {
  const block = /export interface FileRoutesByFullPath \{([^}]*)\}/.exec(readFileSync(TREE, 'utf8'))?.[1] ?? ''
  const paths = [...block.matchAll(/^\s*'([^']+)':/gm)].map((match) => match[1].replace(/(.)\/$/, '$1'))
  return [...new Set(paths)].filter((path) => !SKIP.test(path))
}

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

async function signIn(browser, email, password = PASSWORD) {
  const page = await (await browser.createBrowserContext()).newPage()
  await page.setViewport({ width: 1440, height: 900 })
  await page.goto(`${BASE}/login`)
  await page.locator('::-p-aria(Email)').fill(email)
  await page.locator('::-p-aria(Password)').fill(password)
  await page.locator('button[type=submit]').click()
  await page.waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: 10_000 })
  await sleep(1500)
  return page
}

/** Priya makes the read-only account for an employee with none, and the records the seed lacks; returns its one-time password. */
async function prepare(browser) {
  const page = await signIn(browser, PRIYA)
  if ((await callApi(page, '/maintenance'))?.length === 0)
    await callApi(page, '/maintenance', {
      firstName: 'Hidden',
      lastName: 'Smoke',
      location: 'Front office',
      description: 'A request for the hidden smoke to open: the seed has none.',
    })
  if ((await callApi(page, '/notices'))?.length === 0)
    await callApi(page, '/notices', { title: 'Hidden smoke notice', body: 'For the hidden smoke.', audience: 'all' })
  const linked = new Set(((await callApi(page, '/users')) ?? []).map((user) => user.employeeId))
  const employee = ((await callApi(page, '/employees')) ?? []).find(
    (person) => person.state === 'active' && !linked.has(person.id),
  )
  if (!employee) throw new Error('no active employee without an account for the read-only account')
  const made = await callApi(page, '/users', {
    name: 'Hidden Smoke',
    email: READER,
    access: READ_ONLY,
    superAdmin: false,
    employeeId: employee.id,
  })
  if (!made?.oneTimePassword) throw new Error('could not make the read-only account')
  await page.browserContext().close()
  return made.oneTimePassword
}

/** Signs the read-only account in with its one-time password and sets the demo password, as the app asks it to. */
async function signInReader(browser, oneTime) {
  const page = await signIn(browser, READER, oneTime)
  const changed = await callApi(page, '/auth/password-change', { currentPassword: oneTime, newPassword: PASSWORD })
  if (!changed) throw new Error('could not set the read-only account password')
  await page.goto(`${BASE}/`)
  await sleep(1000)
  return page
}

/** The first record of each kind this account can see, for the route tree's `$params`. */
async function records(page) {
  const get = (path) => callApi(page, path)
  const grievance = (await get('/grievances'))?.rows?.[0]?.code
  const reviews = (await get('/reviews'))?.rows ?? []
  let capReview
  let cap
  for (const { code } of reviews) {
    cap = (await get(`/reviews/${code}/caps`))?.[0]?.seq
    if (cap) {
      capReview = code
      break
    }
  }
  return {
    tag: (await get('/assets'))?.[0]?.tag,
    id: (await get('/tasks'))?.[0]?.id,
    maintenance: (await get('/maintenance'))?.[0]?.id,
    code: grievance,
    seq: grievance && (await get(`/grievances/${grievance}/entries`))?.[0]?.seq,
    review: reviews[0]?.code,
    capReview,
    cap,
    noticeId: (await get('/me/inbox'))?.[0]?.id,
    myTask: (await get('/me/tasks'))?.[0]?.id,
  }
}

/** The address a route-tree path opens at for this account, or null when it has no record for one of its params. */
function addressOf(path, found) {
  const values = {
    ...found,
    id: path.startsWith('/maintenance') ? found.maintenance : path.startsWith('/me/tasks') ? found.myTask : found.id,
    code: path.startsWith('/reviews') ? (path.includes('/caps/') ? found.capReview : found.review) : found.code,
  }
  let missing = false
  const address = path.replace(/\$(\w+)/g, (_, key) => {
    if (values[key] == null) missing = true
    return values[key]
  })
  return missing ? null : address
}

async function open(page, address) {
  await page.goto(`${BASE}${address}`, { waitUntil: 'load', timeout: 20_000 })
  await page.waitForNetworkIdle({ idleTime: 250, timeout: 10_000 }).catch(() => undefined)
  await sleep(400)
}

/** The reasons on this page's disabled controls: hover each for its tooltip; a sidebar entry or menu item carries its words. */
async function disabledReasons(page) {
  const reasons = []
  const controls = await page.$$('[aria-disabled="true"]')
  for (const control of controls) {
    const inline = await control.evaluate((el) => (el.getAttribute('role') === 'link' ? el.innerText : null))
    if (inline !== null) {
      reasons.push(inline.replace(/\s+/g, ' '))
      continue
    }
    if (!(await control.isVisible())) continue
    await control.hover().catch(() => undefined)
    const tip = await page
      .waitForSelector('[role=tooltip]', { timeout: 1200 })
      .then((el) => el.evaluate((node) => node.textContent))
      .catch(() => null)
    if (tip) reasons.push(tip)
    await page.mouse.move(0, 0)
    await sleep(200)
  }
  const triggers = (await page.$$('button[aria-haspopup="menu"]')).slice(0, MENUS)
  for (const trigger of triggers) {
    if (!(await trigger.isVisible())) continue
    await trigger.click().catch(() => undefined)
    const items = await page
      .waitForSelector('[role=menu]', { timeout: 1500 })
      .then(() =>
        page.$$eval('[role=menu] [role=menuitem][data-disabled]', (els) =>
          els.map((el) => el.innerText.replace(/\s+/g, ' ')),
        ),
      )
      .catch(() => [])
    reasons.push(...items)
    await page.keyboard.press('Escape')
    await sleep(200)
  }
  return reasons
}

const pageText = (page) => page.evaluate(() => document.body.innerText)

async function sweep(page, who) {
  const found = await records(page)
  for (const path of routePaths()) {
    const address = addressOf(path, found)
    if (!address) continue
    try {
      await open(page, address)
      const bad = (await disabledReasons(page)).filter((reason) => PERMISSION.test(reason))
      report(bad.length === 0, `${who} ${address}: no control disabled for missing access`, bad.slice(0, 3).join(' | '))
    } catch (error) {
      report(false, `${who} ${address}`, firstLine(error))
    }
  }
  await open(page, '/me/inbox')
  report((await pageText(page)).includes('Coming later'), `${who}: My Dashboard still says "Coming later"`, 'not shown')
}

let browser
let started = false
try {
  started = true
  server('start')
  browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] })
  const oneTime = await prepare(browser)

  await sweep(await signIn(browser, MARCUS), 'marcus')

  const reader = await signInReader(browser, oneTime)
  await sweep(reader, 'reader')
  for (const address of NOT_FOUND_FOR_READER) {
    await open(reader, address)
    report(
      (await pageText(reader)).includes("That page doesn't exist"),
      `reader ${address}: not found`,
      `landed on ${await reader.evaluate(() => location.pathname)} without the not-found page`,
    )
  }
} catch (error) {
  failed++
  console.log(`FAIL: smoke could not run - ${firstLine(error)}`)
} finally {
  await browser?.close().catch(() => undefined)
  if (started) {
    try {
      server('stop')
    } catch (error) {
      console.log(`FAIL: stop the scratch server - ${firstLine(error)}`)
      failed++
    }
  }
}

console.log(failed ? `HIDDEN SMOKE: FAIL (${failed} of ${checks} checks)` : `HIDDEN SMOKE: PASS (${checks} checks)`)
process.exitCode = failed ? 1 : 0
