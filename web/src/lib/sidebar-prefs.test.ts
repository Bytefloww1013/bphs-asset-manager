import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** A stand-in for the browser's localStorage. */
function fakeStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, String(value)),
  }
}

const brokenStorage = (): Storage => {
  const fail = () => {
    throw new Error('SecurityError')
  }
  return { length: 0, clear: fail, getItem: fail, key: fail, removeItem: fail, setItem: fail }
}

// Each test gets a fresh module, as its fallback to memory is module state. The fresh registry needs the modules again.
async function load() {
  const [{ installModules }, { WEB_MODULES }] = await Promise.all([import('@/registry.ts'), import('@/modules.gen.ts')])
  installModules(WEB_MODULES)
  return import('./sidebar-prefs.ts')
}

beforeEach(() => {
  vi.resetModules()
  vi.stubGlobal('localStorage', fakeStorage())
})
afterEach(() => vi.unstubAllGlobals())

describe('pins', () => {
  it('drops unknown paths, record pages, repeats and anything past eight', async () => {
    const { parsePins } = await load()
    expect(parsePins('["/assets","/assets/LT-0042","/nowhere","/assets",3,"/me/inbox"]')).toEqual([
      '/assets',
      '/me/inbox',
    ])
    expect(parsePins('not json')).toEqual([])
    expect(parsePins('{"0":"/assets"}')).toEqual([])
    const many = JSON.stringify([
      '/',
      '/assignments',
      '/available',
      '/assets',
      '/digital-assets',
      '/employees',
      '/programs',
      '/lists',
      '/audit',
    ])
    expect(parsePins(many)).toHaveLength(8)
  })

  it('pins and unpins, keeping only the paths', async () => {
    const { PINS_KEY, readPins, togglePin } = await load()
    togglePin('/assets')
    expect(localStorage.getItem(PINS_KEY)).toBe('["/assets"]')
    expect(readPins()).toEqual(['/assets'])
    togglePin('/assets')
    expect(localStorage.getItem(PINS_KEY)).toBeNull()
    expect(readPins()).toEqual([])
  })

  it('reads a saved record path as nothing', async () => {
    localStorage.setItem('bphs.pins', '["/grievances/G-2026-014"]')
    const { readPins } = await load()
    expect(readPins()).toEqual([])
  })
})

describe('panel', () => {
  it('saves collapsed, and removes the key on reopen', async () => {
    const { SIDEBAR_KEY, panelCollapsed, setPanelCollapsed } = await load()
    expect(panelCollapsed()).toBe(false)
    setPanelCollapsed(true)
    expect(localStorage.getItem(SIDEBAR_KEY)).toBe('collapsed')
    expect(panelCollapsed()).toBe(true)
    setPanelCollapsed(false)
    expect(localStorage.getItem(SIDEBAR_KEY)).toBeNull()
  })
})

describe('storage errors', () => {
  it('are ignored, and the choices last in memory', async () => {
    vi.stubGlobal('localStorage', brokenStorage())
    const { panelCollapsed, readPins, setPanelCollapsed, togglePin } = await load()
    expect(panelCollapsed()).toBe(false)
    expect(readPins()).toEqual([])
    expect(() => setPanelCollapsed(true)).not.toThrow()
    expect(panelCollapsed()).toBe(true)
    expect(() => togglePin('/assets')).not.toThrow()
    expect(readPins()).toEqual(['/assets'])
  })
})
