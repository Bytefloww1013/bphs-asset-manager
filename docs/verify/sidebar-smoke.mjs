// Sidebar rail smoke test (issue #6) in headless Chrome for Testing, against docs/verify/scratch-server.sh (seeded demo data).
// Steps and names follow the UI contract in SidebarRail-plan.md. One PASS/FAIL line per step; exit 1 if any fails.
// puppeteer-core lives outside the repo (not a project dependency); it is installed there on first run.
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'

/** Where scratch files go: `BPHS_TMP`, else the system temp folder. */
const TMP = process.env.BPHS_TMP ?? process.env.TMPDIR ?? '/tmp'

const TOOLS = `${TMP}/bphs-qa-tools`
if (!fs.existsSync(`${TOOLS}/node_modules/puppeteer-core`)) execSync(`npm install --silent --prefix ${TOOLS} puppeteer-core`, { stdio: 'inherit' })
const puppeteer = createRequire(`${TOOLS}/`)('puppeteer-core')

const CHROME = process.env.CHROME ?? `${TMP}/bphs-spike-chrome/chrome/linux-155.0.8059.39/chrome-linux64/chrome`
const BASE = `http://localhost:${process.env.PORT ?? 3388}`
const PASSWORD = 'Demo-pass1!'
const PRIYA = 'p.raghunathan@bphs.local'
const MARCUS = 'm.oyelaran@bphs.local'
const ALL_AREAS = ['Home', 'Assets', 'Maintenance', 'Employee Tasks', 'Administrative Reviews', 'Grievances']
const AREA_HOME = { Home: '/me/inbox', Assets: '/', Maintenance: '/maintenance', 'Employee Tasks': '/tasks', 'Administrative Reviews': '/reviews', Grievances: '/grievances' }
const DESKTOP = { width: 1440, height: 900 }
const PHONE = { width: 390, height: 844 }

let failed = 0
const errors = []
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const assert = (ok, message) => {
  if (!ok) throw new Error(message)
}

async function step(name, fn) {
  try {
    await fn()
    console.log(`PASS: ${name}`)
  } catch (error) {
    failed++
    console.log(`FAIL: ${name} - ${error.message.split('\n')[0]}`)
  }
}

async function signIn(browser, email) {
  const page = await (await browser.createBrowserContext()).newPage()
  await page.setViewport(DESKTOP)
  await page.goto(`${BASE}/login`)
  await page.locator('::-p-aria(Email)').fill(email)
  await page.locator('::-p-aria(Password)').fill(PASSWORD)
  await page.locator('button[type=submit]').click()
  await page.waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: 10_000 })
  await sleep(1500) // the SPA's own redirect aborts an early goto
  // Counted from here: the login page's 401 for the missing session is expected.
  page.on('console', (msg) => msg.type() === 'error' && errors.push(`${email}: ${msg.text()}`))
  page.on('pageerror', (error) => errors.push(`${email}: ${error.message}`))
  return page
}

async function open(page, path, viewport = DESKTOP) {
  await page.setViewport(viewport)
  await page.goto(`${BASE}${path}`)
  await page.waitForSelector('#main', { timeout: 10_000 })
  await sleep(300)
}

/** The desktop rail's areas, by accessible name, in order (visible ones only: More holds the rest). */
const railNames = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('nav[aria-label="Workspaces"]:not([role=dialog] *) a')]
      .filter((a) => a.getClientRects().length > 0)
      .map((a) => a.getAttribute('aria-label') ?? a.textContent.trim()),
  )

/** Links (and disabled entries) of a Pages nav, as "label -> href". */
const pageLinks = (page, scope) =>
  page.evaluate(
    (scope) =>
      [...document.querySelectorAll(`${scope} nav[aria-label="Pages"] a, ${scope} nav[aria-label="Pages"] [role=link]`)].map(
        (a) => `${a.textContent.replace(/\s+/g, ' ').trim()} -> ${a.getAttribute('href') ?? 'disabled'}`,
      ),
    scope,
  )

const pressChord = async (page, modifier, key) => {
  await page.keyboard.down(modifier)
  await page.keyboard.press(key)
  await page.keyboard.up(modifier)
}

let browser
try {
  browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] })
  const priya = await signIn(browser, PRIYA)

  await step('1 rail order, skip link first, no count on confidential areas', async () => {
    await open(priya, '/assets')
    const names = await railNames(priya)
    assert(JSON.stringify(names) === JSON.stringify(ALL_AREAS), `rail is ${JSON.stringify(names)}`)
    await priya.keyboard.press('Tab')
    const first = await priya.evaluate(() => document.activeElement?.textContent?.trim())
    assert(first === 'Skip to content', `first Tab stop is "${first}"`)
    for (const path of ['/grievances', '/reviews']) {
      await open(priya, path)
      const panel = await priya.$eval('#pages-panel', (el) => el.textContent)
      assert(panel.includes('Confidential'), `${path}: no Confidential line`)
      assert(!/unread/i.test(panel), `${path}: the panel shows a count`)
      const rail = await priya.evaluate(() =>
        [...document.querySelectorAll('nav[aria-label="Workspaces"] a')]
          .filter((a) => ['Grievances', 'Administrative Reviews'].includes(a.getAttribute('aria-label')))
          .map((a) => a.textContent),
      )
      assert(rail.length === 2 && rail.every((t) => !/\d|unread/i.test(t)), `${path}: a confidential rail item carries a count`)
    }
  })

  await step('2 the panel and the phone drawer list the same links', async () => {
    for (const area of ALL_AREAS) {
      await open(priya, AREA_HOME[area])
      const panel = await pageLinks(priya, '#pages-panel')
      await open(priya, AREA_HOME[area], PHONE)
      await priya.locator('::-p-aria(Open navigation)').click()
      await priya.waitForSelector('[role=dialog] nav[aria-label="Pages"]')
      const drawer = await pageLinks(priya, '[role=dialog]')
      assert(panel.length > 0, `${area}: the panel has no links`)
      assert(JSON.stringify(panel) === JSON.stringify(drawer), `${area}: panel ${JSON.stringify(panel)} vs drawer ${JSON.stringify(drawer)}`)
    }
  })

  await step('3 collapse the panel, still collapsed after a reload, then reopen', async () => {
    await open(priya, '/assets')
    const toggle = '::-p-aria([name="Pages panel"][role="button"])'
    await priya.locator(toggle).click()
    await sleep(400)
    const state = () =>
      priya.evaluate(() => ({
        expanded: document.querySelector('[aria-controls="pages-panel"]')?.getAttribute('aria-expanded'),
        inert: document.getElementById('pages-panel')?.hasAttribute('inert'),
        saved: localStorage.getItem('bphs.sidebar'),
      }))
    let now = await state()
    assert(now.expanded === 'false' && now.inert && now.saved === 'collapsed', `after collapse ${JSON.stringify(now)}`)
    await open(priya, '/assets')
    now = await state()
    assert(now.expanded === 'false' && now.inert, `after reload ${JSON.stringify(now)}`)
    await priya.locator(toggle).click()
    await sleep(400)
    now = await state()
    assert(now.expanded === 'true' && !now.inert && now.saved === null, `after reopen ${JSON.stringify(now)}`)
  })

  await step('4 Ctrl+K jumps to a page', async () => {
    await open(priya, '/assets')
    await pressChord(priya, 'Control', 'k')
    await priya.waitForSelector('::-p-aria([name="Jump to a page"][role="dialog"])', { timeout: 5000 })
    const options = await priya.$$eval('[role=dialog] [role=option]', (els) => els.map((el) => el.textContent))
    assert(options.length > 0 && options.every((t) => !/unread/i.test(t)), 'no options, or an option shows a count')
    await priya.keyboard.type('categories')
    await priya.keyboard.press('Enter')
    await priya.waitForFunction(() => location.pathname === '/grievances/categories', { timeout: 5000 })
  })

  await step('5 More appears on a short window and keeps the active area in view', async () => {
    await open(priya, '/grievances', { width: 1440, height: 480 })
    await priya.waitForSelector('::-p-aria([name="More workspaces"][role="button"])', { timeout: 5000 })
    const active = await priya.evaluate(() => {
      const a = document.querySelector('nav[aria-label="Workspaces"]:not([role=dialog] *) a[aria-current="true"]')
      return a && a.getClientRects().length > 0 ? a.getAttribute('aria-label') : null
    })
    assert(active === 'Grievances', `active rail item in view is ${active}`)
  })

  await step('6 Physical Assets does not scroll sideways at 1366', async () => {
    await open(priya, '/assets', { width: 1366, height: 768 })
    await priya.waitForSelector('#main table', { timeout: 10_000 })
    const { scroll, inner } = await priya.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: innerWidth }))
    assert(scroll <= inner, `scrollWidth ${scroll} > innerWidth ${inner}`)
  })

  await step('7 pin a page; Home lists it; storage holds the path only', async () => {
    await open(priya, '/assets')
    await priya.locator('::-p-aria([name="Pin this page"][role="button"])').click()
    await open(priya, '/me/inbox')
    const pinned = await priya.$$eval('#pages-panel a[href="/assets"]', (els) => els.length)
    assert(pinned >= 1, 'Home does not list the pinned page')
    const saved = await priya.evaluate(() => localStorage.getItem('bphs.pins'))
    assert(saved === '["/assets"]', `bphs.pins is ${saved}`)
  })

  await step('8 an account without Maintenance does not see it', async () => {
    const marcus = await signIn(browser, MARCUS)
    await open(marcus, '/assets')
    const names = await railNames(marcus)
    const want = ALL_AREAS.filter((area) => area !== 'Maintenance')
    assert(JSON.stringify(names) === JSON.stringify(want), `rail is ${JSON.stringify(names)}`)
    await marcus.browserContext().close()
  })

  await step('9 phone drawer: drill-down, closes on a link and past lg', async () => {
    await open(priya, '/assets', PHONE)
    await priya.locator('::-p-aria(Open navigation)').click()
    await priya.waitForSelector('::-p-aria([name="Navigation"][role="dialog"])')
    assert(await priya.$('[role=dialog] nav[aria-label="Pages"] a[href="/assets"]'), 'drawer does not open on the current pages')
    await priya.locator('::-p-aria([name="All workspaces"][role="button"])').click()
    await priya.waitForSelector('[role=dialog] nav[aria-label="Workspaces"]')
    await priya.locator('[role=dialog] nav[aria-label="Workspaces"] [aria-label="Maintenance"]').click()
    await priya.waitForSelector('[role=dialog] nav[aria-label="Pages"] a[href="/maintenance"]')
    await priya.locator('[role=dialog] nav[aria-label="Pages"] a[href="/maintenance"]').click()
    await priya.waitForFunction(() => location.pathname === '/maintenance' && !document.querySelector('[role=dialog]'), { timeout: 5000 })
    await priya.locator('::-p-aria(Open navigation)').click()
    await priya.waitForSelector('[role=dialog]')
    await priya.setViewport({ width: 1280, height: 844 })
    await priya.waitForFunction(() => !document.querySelector('[role=dialog]'), { timeout: 5000 })
  })

  await step('10 no console errors', async () => {
    assert(errors.length === 0, errors.slice(0, 3).join(' | '))
  })
} catch (error) {
  failed++
  console.log(`FAIL: smoke could not run - ${error.message.split('\n')[0]}`)
} finally {
  await browser?.close()
}

console.log(failed ? `SMOKE: FAIL (${failed})` : 'SMOKE: PASS')
process.exitCode = failed ? 1 : 0
