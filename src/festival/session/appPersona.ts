/**
 * アプリ入口（ペルソナ）の切替。
 * 現状は sessionStorage。将来の認証導入時は、ここを AuthProvider / session API へ差し替える想定。
 */
import type { AppPersona } from '../types'

const STORAGE_KEY = 'daidougei-haku-app-persona-v1'
const VALID = new Set<AppPersona>(['visitor', 'performer', 'admin'])

export function readAppPersona(): AppPersona {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (raw && VALID.has(raw as AppPersona)) return raw as AppPersona
  } catch {
    /* private mode 等 */
  }
  return 'visitor'
}

export function writeAppPersona(persona: AppPersona) {
  try {
    sessionStorage.setItem(STORAGE_KEY, persona)
  } catch {
    /* ignore */
  }
}
