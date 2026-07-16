import { isDemoMode } from '../config/runtimeConfig'

/**
 * モード別 localStorage キー。
 * デモの申請・LIVE override を公開モードへ引き継がない。
 */
export function modeScopedStorageKey(base: string): string {
  return `${base}__${isDemoMode ? 'demo' : 'public'}`
}

/** 推しなどユーザー設定はモード共通（可能な限り維持） */
export function sharedStorageKey(base: string): string {
  return base
}

export function safeJsonParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}
