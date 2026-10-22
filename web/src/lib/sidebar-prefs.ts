import { useSyncExternalStore } from 'react'
import { isNavPath, type NavPath } from './nav.ts'

// ---- What the sidebar keeps in the browser ---------------------------------------------------
// Whether the pages panel is collapsed, and the sidebar pages pinned to Home. Nothing from inside a workspace: a pin is a
// sidebar page's path, checked against the nav model on every read, never a record.
export const SIDEBAR_KEY = 'bphs.sidebar'
export const PINS_KEY = 'bphs.pins'
export const MAX_PINS = 8

const listeners = new Set<() => void>()
const changed = () => listeners.forEach((listener) => listener())
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// Storage is off or full: from then on the choices are kept here, and last until the page is reloaded.
const memory = new Map<string, string>()
let inMemory = false

function read(key: string): string | null {
  if (inMemory) return memory.get(key) ?? null
  try {
    return localStorage.getItem(key)
  } catch {
    inMemory = true
    return null
  }
}

function write(key: string, value: string | null) {
  if (value === null) memory.delete(key)
  else memory.set(key, value)
  if (!inMemory) {
    try {
      if (value === null) localStorage.removeItem(key)
      else localStorage.setItem(key, value)
    } catch {
      inMemory = true
    }
  }
  changed()
}

export const panelCollapsed = (): boolean => read(SIDEBAR_KEY) === 'collapsed'

export const setPanelCollapsed = (collapsed: boolean) => write(SIDEBAR_KEY, collapsed ? 'collapsed' : null)

/** The pins, in the order they were added: sidebar pages only, no repeats, at most eight. Anything else saved is dropped. */
export function parsePins(raw: string | null): NavPath[] {
  if (!raw) return []
  let saved: unknown
  try {
    saved = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(saved)) return []
  return [...new Set(saved.filter(isNavPath))].slice(0, MAX_PINS)
}

let cache: { raw: string | null; pins: NavPath[] } = { raw: null, pins: [] }

/** The same array while storage is unchanged, as `useSyncExternalStore` needs. */
export function readPins(): NavPath[] {
  const raw = read(PINS_KEY)
  if (raw !== cache.raw) cache = { raw, pins: parsePins(raw) }
  return cache.pins
}

export function writePins(pins: readonly NavPath[]) {
  const kept = parsePins(JSON.stringify(pins))
  write(PINS_KEY, kept.length ? JSON.stringify(kept) : null)
}

/** Pins the page, or unpins it if it is pinned. A ninth pin is not added. */
export function togglePin(path: NavPath) {
  const pins = readPins()
  writePins(pins.includes(path) ? pins.filter((pin) => pin !== path) : [...pins, path])
}

export const usePanelCollapsed = () => useSyncExternalStore(subscribe, panelCollapsed, () => false)

export const usePins = () => useSyncExternalStore(subscribe, readPins, () => cache.pins)
