import { openPlatform } from '../../app/routes'
import { addOshi, follow, isOshi, listOshiPerformers, removeOshi } from '../../platform/lib/api'
import { isSupabaseConfigured } from '../../platform/lib/supabase'
import { readFavorites, writeFavorites } from './favoritesStorage'

export async function syncOshiFromAccount(userId: string): Promise<string[]> {
  if (!isSupabaseConfigured) return readFavorites()
  const local = readFavorites()
  await Promise.all(local.map((id) => addOshi(userId, id).catch(() => undefined)))
  const remote = await listOshiPerformers(userId)
  const ids = remote.map((p) => p.id)
  writeFavorites(ids)
  return ids
}

export async function toggleOshiOrLogin(
  userId: string | undefined,
  performerId: string,
): Promise<'login' | 'on' | 'off'> {
  if (!userId || !isSupabaseConfigured) {
    openPlatform('?auth=1')
    return 'login'
  }
  const on = await isOshi(userId, performerId)
  if (on) {
    await removeOshi(userId, performerId)
    writeFavorites(readFavorites().filter((id) => id !== performerId))
    return 'off'
  }
  await addOshi(userId, performerId)
  await follow(userId, performerId).catch(() => undefined)
  writeFavorites([...readFavorites(), performerId])
  return 'on'
}
