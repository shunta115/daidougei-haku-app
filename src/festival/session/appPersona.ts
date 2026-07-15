import type { AppPersona } from '../types'

const KEY = 'daidougei-haku-persona-v1'

export function readAppPersona(): AppPersona {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw === 'performer' || raw === 'admin') return raw
  } catch {
    /* ignore */
  }
  return 'visitor'
}

export function writeAppPersona(persona: AppPersona) {
  localStorage.setItem(KEY, persona)
}
