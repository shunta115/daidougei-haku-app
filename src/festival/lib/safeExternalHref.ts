import { isValidHttpUrl } from './productionGuard'

/** 外部リンク用: http(s) 以外は undefined（遷移させない） */
export function safeExternalHref(url: string | undefined): string | undefined {
  return isValidHttpUrl(url) ? url : undefined
}
