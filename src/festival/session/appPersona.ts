import type { AppPersona } from '../types'
import { IS_DEV } from '../lib/productionGuard'
import { modeScopedStorageKey } from '../lib/storageScope'

const KEY = modeScopedStorageKey('daidougei-haku-persona-v1')

export function readAppPersona(): AppPersona {
  try {
    const raw = localStorage.getItem(KEY)
    if (IS_DEV && (raw === 'performer' || raw === 'admin')) return raw
  } catch {
    /* ignore */
  }
  return 'visitor'
}

export function writeAppPersona(persona: AppPersona) {
  if (!IS_DEV && persona !== 'visitor') return
  try {
    localStorage.setItem(KEY, persona)
  } catch {
    /* ignore */
  }
}
