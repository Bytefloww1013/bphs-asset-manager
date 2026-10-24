// Task system smoke test in headless Firefox, against docs/verify/scratch-server.sh (seeded demo data).
// A Super Admin assigns a task → the assignee's bell shows it → its deep link opens My Space › Tasks → Mark complete.
// puppeteer-core lives outside the repo (not a project dependency); it is installed there on first run.
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'

/** Where scratch files go: `BPHS_TMP`, else the system temp folder. */
const TMP = process.env.BPHS_TMP ?? process.env.TMPDIR ?? '/tmp'

const TOOLS = `${TMP}/bphs-qa-tools`
if (!fs.existsSync(`${TOOLS}/node_modules/puppeteer-core`)) execSync(`npm install --silent --prefix ${TOOLS} puppeteer-core`, { stdio: 'inherit' })
const puppeteer = createRequire(`${TOOLS}/`)('puppeteer-core')

const BASE = `http://localhost:${process.env.PORT ?? 3388}`
const PASSWORD = 'Demo-pass1!'
const ADMIN = 'p.raghunathan@bphs.local'
const ASSIGNEE = { email: 'r.delgado@bphs.local', name: 'Rosa' }
const TITLE = `Smoke task ${Date.now()}`
// Snap Firefox cannot read /tmp or dot-folders; a fresh profile per run, removed in finally.
const profile = `${TMP}/bphs-qa-profiles/tasks-smoke-${Date.now()}`

const step = (name) => console.log(`  - ${name}`)

// Puppeteer's ::-p-aria needs CDP, which Firefox (WebDriver BiDi) lacks: find controls by aria-label or <label> text in the page.
async function byLabel(page, name, timeout = 10_000) {
  const handle = await page.waitForFunction(
    (name) => {
      const visible = (el) => el && el.getClientRects().length > 0
      const labelled = [...document.querySelectorAll('[aria-label]')].find((el) => el.getAttribute('aria-label') === name && visible(el))
      if (labelled) return labelled
      const label = [...document.querySelectorAll('label')].find((l) => l.textContent.trim().startsWith(name))
      const control = label?.control ?? (label?.htmlFor && document.getElementById(label.htmlFor))
      if (visible(control)) return control
      return [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === name && visible(b)) ?? null
    },
    { timeout },
    name,
  )
  return handle.asElement()
}

async function signIn(context, email) {
  const page = await context.newPage()
  await page.setViewport({ width: 1280, height: 900 }) // the default 800×600 is the mobile layout, with the sidebar's bell hidden
  await page.goto(`${BASE}/login`)
  await (await byLabel(page, 'Email')).type(email)
  await (await byLabel(page, 'Password')).type(PASSWORD)
  await page.locator('button[type=submit]').click()
  await page.waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: 10_000 })
  await new Promise((resolve) => setTimeout(resolve, 1500)) // the SPA's own redirect aborts an early goto
  step(`signed in as ${email}`)
  return page
}

let browser
try {
  fs.mkdirSync(profile, { recursive: true })
  browser = await puppeteer.launch({ browser: 'firefox', executablePath: process.env.FIREFOX ?? '/snap/bin/firefox', headless: true, userDataDir: profile })

  step('Super Admin assigns a task in Employee Tasks')
  const admin = await signIn(await browser.createBrowserContext(), ADMIN)
  await admin.goto(`${BASE}/tasks/new`)
  await (await byLabel(admin, 'Assignees')).type(ASSIGNEE.name)
  await admin.keyboard.press('Enter')
  await (await byLabel(admin, 'Title')).type(TITLE)
  await (await byLabel(admin, 'Body')).click()
  await admin.keyboard.type('Check the smoke detector in room 4.')
  const due = new Date(Date.now() + 3 * 86_400_000)
  const pad = (n) => String(n).padStart(2, '0')
  // Firefox's datetime-local segments follow the US locale: mm dd yyyy hh mm AM/PM.
  await (await byLabel(admin, 'Due')).type(`${pad(due.getMonth() + 1)}${pad(due.getDate())}${due.getFullYear()}0500PM`)
  await (await byLabel(admin, 'Assign task')).click()
  await admin.waitForFunction(() => /^\/tasks\/\d+$/.test(location.pathname), { timeout: 10_000 })

  step("assignee's bell shows it")
  const rosa = await signIn(await browser.createBrowserContext(), ASSIGNEE.email)
  // The bell's name carries the unread count ("Notifications, 1 unread").
  await rosa.locator('button[aria-label^="Notifications"]').click()
  const link = await rosa.waitForSelector(`::-p-text(${TITLE})`, { timeout: 10_000 })

  step('the deep link opens it in My Space › Tasks')
  await link.click()
  await rosa.waitForFunction(() => /^\/me\/tasks\/\d+$/.test(location.pathname), { timeout: 10_000 })
  await rosa.waitForSelector(`::-p-text(${TITLE})`)

  step('Mark complete')
  await (await byLabel(rosa, 'Mark complete')).click()
  await rosa.waitForSelector('::-p-text(Completed)', { timeout: 10_000 })

  console.log('SMOKE: PASS')
} catch (error) {
  console.error(`SMOKE: FAIL ${error.message}`)
  process.exitCode = 1
} finally {
  await browser?.close()
  fs.rmSync(profile, { recursive: true, force: true })
}
