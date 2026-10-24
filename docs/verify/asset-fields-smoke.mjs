// Asset Brand, Model and Entra ObjectId smoke test (issue #19) in headless Chrome for Testing, against docs/verify/scratch-server.sh
// (seeded demo data). Steps follow the Decisions in AssetBrandModelEntra-plan.md. One PASS/FAIL line per step; exit 1 if any fails.
// puppeteer-core lives outside the repo (not a project dependency); it is installed there on first run.
import { execSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import { createRequire } from 'node:module'

/** Where scratch files go: `BPHS_TMP`, else the system temp folder. */
const TMP = process.env.BPHS_TMP ?? process.env.TMPDIR ?? '/tmp'

const TOOLS = `${TMP}/bphs-qa-tools`
if (!fs.existsSync(`${TOOLS}/node_modules/puppeteer-core`))
  execSync(`npm install --silent --prefix ${TOOLS} puppeteer-core`, { stdio: 'inherit' })
const puppeteer = createRequire(`${TOOLS}/`)('puppeteer-core')

const CHROME = process.env.CHROME ?? `${TMP}/bphs-spike-chrome/chrome/linux-155.0.8059.39/chrome-linux64/chrome`
const BASE = `http://localhost:${process.env.PORT ?? 3388}`
const PASSWORD = 'Demo-pass1!'
const PRIYA = 'p.raghunathan@bphs.local'
// Model and Entra ObjectId columns show from 2xl (1536px) up.
const DESKTOP = { width: 1600, height: 1000 }
const RUN = Date.now().toString(36).toUpperCase()

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

async function open(page, path) {
  await page.goto(`${BASE}${path}`)
  await page.waitForSelector('#main', { timeout: 10_000 })
  await sleep(300)
}

/** The API with the page's session cookie. Every non-GET request carries JSON, as the web client does (Hono's csrf()). */
async function api(page, method, path, body) {
  const { status, json } = await page.evaluate(
    async (method, path, body) => {
      const init = { method, headers: { 'Content-Type': 'application/json' } }
      if (body !== undefined) init.body = JSON.stringify(body)
      const res = await fetch(`/api${path}`, init)
      const text = await res.text()
      return { status: res.status, json: text ? JSON.parse(text) : null }
    },
    method,
    path,
    body,
  )
  assert(status < 300, `${method} ${path} answered ${status}: ${JSON.stringify(json)}`)
  return json
}

/** The control a visible <label> names (Field ties them with htmlFor), inside `scope`. */
async function control(page, scope, label) {
  const handle = await page.waitForFunction(
    (scope, label) => {
      const root = document.querySelector(scope)
      const found = [...(root?.querySelectorAll('label') ?? [])].find(
        (l) => l.firstChild?.textContent?.trim() === label && l.getClientRects().length > 0,
      )
      return found?.control ?? null
    },
    { timeout: 10_000 },
    scope,
    label,
  )
  return handle.asElement()
}

/** The value of a control plus the hint and error text its aria-describedby points at. */
const fieldState = (handle) =>
  handle.evaluate((el) => {
    const described = (el.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean)
    const text = (suffix) =>
      described.filter((id) => id.endsWith(suffix)).map((id) => document.getElementById(id)?.textContent?.trim())
    return {
      value: el.value,
      hint: text('-hint').join(' '),
      error: text('-error').join(' '),
      invalid: el.getAttribute('aria-invalid'),
    }
  })

/** Rows of a DataGrid as { heading: cell text } over its visible columns. */
const gridRows = (page, label) =>
  page.evaluate((label) => {
    const table = document.querySelector(`table[aria-label="${label}"]`)
    if (!table) return null
    const visible = (el) => el.getClientRects().length > 0
    const headings = [...table.querySelectorAll('thead th')].map((th) => (visible(th) ? th.textContent.trim() : null))
    return [...table.querySelectorAll('tbody tr')].map((tr) =>
      Object.fromEntries(
        [...tr.children].flatMap((td, i) =>
          headings[i] ? [[headings[i], td.textContent.replace(/\s+/g, ' ').trim()]] : [],
        ),
      ),
    )
  }, label)

/** The facts of the asset detail page, as { label: value }. */
const facts = (page) =>
  page.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll('#main dl > div')].map((div) => [
        div.querySelector('dt')?.textContent.trim(),
        div.querySelector('dd')?.textContent.replace(/\s+/g, ' ').trim(),
      ]),
    ),
  )

let browser
try {
  browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] })
  const priya = await signIn(browser, PRIYA)
  const assets = await api(priya, 'GET', '/assets')
  const brands = await api(priya, 'GET', '/asset-brands')
  const brandId = (name) => brands.find((b) => b.name === name)?.id

  await step(
    '1 Physical Assets shows Brand, Model and Entra ObjectId; searching a brand filters the rows',
    async () => {
      await open(priya, '/assets')
      await priya.waitForSelector('table[aria-label="Physical assets"] tbody tr', { timeout: 10_000 })
      const before = await gridRows(priya, 'Physical assets')
      const headings = Object.keys(before[0] ?? {})
      for (const want of ['Brand', 'Model', 'Entra ObjectId'])
        assert(headings.includes(want), `no visible "${want}" column in ${JSON.stringify(headings)}`)
      const order = ['Type', 'Brand', 'Model', 'Entra ObjectId', 'Serial'].map((h) =>
        headings.findIndex((x) => x.startsWith(h)),
      )
      assert(
        order.every((at, i) => at >= 0 && (i === 0 || at > order[i - 1])),
        `columns are not Type, Brand, Model, Entra, Serial: ${JSON.stringify(headings)}`,
      )
      const lenovo = assets.filter((a) => a.brand === 'Lenovo').length
      assert(
        lenovo > 0 && before.length > lenovo,
        `need a brand with fewer rows than the page (Lenovo ${lenovo}, page ${before.length})`,
      )
      await priya.locator('input[aria-label="Search physical assets"]').fill('lenovo')
      await priya.waitForFunction(
        (n) => document.querySelectorAll('table[aria-label="Physical assets"] tbody tr').length === n,
        { timeout: 5000 },
        lenovo,
      )
      const after = await gridRows(priya, 'Physical assets')
      assert(
        after.every((row) => row.Brand === 'Lenovo'),
        `a non-Lenovo row: ${JSON.stringify(after.find((row) => row.Brand !== 'Lenovo'))}`,
      )
    },
  )

  const shown = assets.find((a) => a.entraObjectId && a.model && a.brandActive)
  await step(`2 the detail page of ${shown?.tag} shows its Brand, Model and Entra ObjectId`, async () => {
    assert(shown, 'no seeded asset with a Model and an Entra ObjectId')
    await open(priya, `/assets/${shown.tag}`)
    await priya.waitForFunction(
      () => [...document.querySelectorAll('#main dt')].some((dt) => dt.textContent.trim() === 'Entra ObjectId'),
      {
        timeout: 10_000,
      },
    )
    const got = await facts(priya)
    const want = { Brand: shown.brand, Model: shown.model, 'Entra ObjectId': shown.entraObjectId }
    for (const [label, value] of Object.entries(want))
      assert(got[label] === value, `${label} is "${got[label]}", want "${value}"`)
  })

  await step('3 Lists shows the Physical asset brands, with Unknown archived', async () => {
    await open(priya, '/lists')
    await priya.waitForSelector('table[aria-label="Physical asset brands"] tbody tr', { timeout: 10_000 })
    const rows = await priya.$$eval('table[aria-label="Physical asset brands"] tbody tr', (trs) =>
      trs.map((tr) => ({
        name: tr.querySelector('td span.font-medium')?.textContent.trim(),
        active: tr.querySelector('[role=switch]')?.getAttribute('aria-checked'),
      })),
    )
    const names = rows.map((r) => r.name).sort()
    const want = brands.map((b) => b.name).sort()
    assert(
      JSON.stringify(names) === JSON.stringify(want),
      `brands ${JSON.stringify(names)}, want ${JSON.stringify(want)}`,
    )
    assert(rows.find((r) => r.name === 'Unknown')?.active === 'false', 'Unknown is not archived')
    assert(
      rows.filter((r) => r.name !== 'Unknown').every((r) => r.active === 'true'),
      `a seeded brand is not active: ${JSON.stringify(rows)}`,
    )
  })

  await step(
    '4 Quick add stores Brand, Model and a lowercased Entra ObjectId; a bad ObjectId adds nothing',
    async () => {
      const tag = `SMOKE-${RUN}`
      const entra = randomUUID().toUpperCase()
      await open(priya, '/assets')
      await (await control(priya, '#main', 'Asset tag')).type(tag)
      await priya.select(
        await control(priya, '#main', 'Brand').then((h) => h.evaluate((el) => `#${CSS.escape(el.id)}`)),
        String(brandId('Dell')),
      )
      await (await control(priya, '#main', 'Model')).type('Latitude 5450')
      await (await control(priya, '#main', 'Entra ObjectId')).type(entra)
      const type = await (await control(priya, '#main', 'Type')).evaluate((el) => el.selectedOptions[0]?.textContent)
      await priya.locator('#main form button[type=submit]::-p-text(Add)').click()
      let row
      for (let i = 0; i < 20 && !row; i++) {
        await sleep(250)
        row = (await api(priya, 'GET', '/assets')).find((a) => a.tag === tag)
      }
      assert(row, `${tag} was not added`)
      const got = { type: row.type, brand: row.brand, model: row.model, entraObjectId: row.entraObjectId }
      const want = { type, brand: 'Dell', model: 'Latitude 5450', entraObjectId: entra.toLowerCase() }
      assert(
        JSON.stringify(got) === JSON.stringify(want),
        `stored ${JSON.stringify(got)}, want ${JSON.stringify(want)}`,
      )

      const bad = `SMOKE-${RUN}-BAD`
      await priya.waitForFunction(() => document.activeElement?.value === '', { timeout: 5000 }) // the tag is cleared for the next asset
      await priya.keyboard.type(bad)
      const entraInput = await control(priya, '#main', 'Entra ObjectId')
      await entraInput.type('not-a-guid')
      await priya.locator('#main form button[type=submit]::-p-text(Add)').click()
      await priya.waitForFunction((el) => el.getAttribute('aria-invalid') === 'true', { timeout: 5000 }, entraInput)
      const state = await fieldState(entraInput)
      assert(/GUID/.test(state.error), `Entra ObjectId error is "${state.error}"`)
      await sleep(500)
      assert(!(await api(priya, 'GET', '/assets')).some((a) => a.tag === bad), `${bad} was added`)
    },
  )

  await step('5 the edit sheet of an asset on archived Unknown asks for a brand, then saves one', async () => {
    const unknown = brandId('Unknown')
    const target = assets.find((a) => a.state === 'in_storage' && a.tag !== shown?.tag)
    assert(unknown && target, 'no Unknown brand or no asset in storage')
    await api(priya, 'PATCH', `/asset-brands/${unknown}`, { isActive: true })
    await api(priya, 'PATCH', `/assets/${target.id}`, { brandId: unknown })
    await api(priya, 'PATCH', `/asset-brands/${unknown}`, { isActive: false })

    await open(priya, `/assets/${target.tag}`)
    await priya.locator(`button[aria-label="More actions for ${target.tag}"]`).click()
    await priya.locator('[role=menuitem]::-p-text(Edit details)').click()
    await priya.waitForSelector('[role=dialog] form#asset-edit-form', { timeout: 5000 })
    const brand = await control(priya, '[role=dialog]', 'Brand')
    let state = await fieldState(brand)
    assert(state.value === '', `Brand starts as "${state.value}"`)
    assert(state.hint === 'Unknown is archived; choose a brand', `Brand hint is "${state.hint}"`)
    const save = '[role=dialog] button[type=submit][form=asset-edit-form]'
    await priya.locator(save).click()
    await priya.waitForFunction((el) => el.getAttribute('aria-invalid') === 'true', { timeout: 5000 }, brand)
    state = await fieldState(brand)
    assert(state.error === 'Choose a brand', `Brand error is "${state.error}"`)
    assert(
      (await api(priya, 'GET', '/assets')).find((a) => a.id === target.id)?.brandId === unknown,
      'saved without a brand',
    )

    await priya.select(await brand.evaluate((el) => `#${CSS.escape(el.id)}`), String(brandId('HP')))
    await priya.locator(save).click()
    await priya.waitForFunction(() => !document.querySelector('[role=dialog]'), { timeout: 5000 })
    const row = (await api(priya, 'GET', '/assets')).find((a) => a.id === target.id)
    assert(row?.brand === 'HP' && row.brandActive, `stored brand is ${row?.brand} (active ${row?.brandActive})`)
    await priya.waitForFunction(
      () =>
        [...document.querySelectorAll('#main dl > div')].some(
          (d) =>
            d.querySelector('dt')?.textContent.trim() === 'Brand' && d.querySelector('dd')?.textContent.trim() === 'HP',
        ),
      { timeout: 5000 },
    )
  })

  await step('6 no console errors', async () => {
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
