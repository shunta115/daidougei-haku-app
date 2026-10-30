import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  appendLiveComment,
  hasIncomingLiveComment,
  isNearCommentEnd,
  removeLiveComment,
} from '../src/platform/lib/useLiveCommentScroll'
import type { LiveComment } from '../src/platform/lib/types'

function comment(id: string): LiveComment {
  return { id, performer_id: 'performer-1', live_session_id: 'session-1', user_id: `user-${id}`, display_name: `Fan ${id}`, body: `Comment ${id}`, created_at: new Date(0).toISOString() }
}

describe('LIVE comment session and scrolling', () => {
  it('keeps realtime inserts unique and bounded, and applies realtime deletes', () => {
    const initial = Array.from({ length: 80 }, (_, index) => comment(String(index)))
    const appended = appendLiveComment(initial, comment('80'))
    expect(appended).toHaveLength(80)
    expect(appended[0].id).toBe('1')
    expect(appendLiveComment(appended, comment('80'))).toBe(appended)
    expect(removeLiveComment(appended, '80').some((row) => row.id === '80')).toBe(false)
  })

  it.each([100, 1000])('keeps the video layout independent of %i incoming comments', (total) => {
    const comments = Array.from({ length: total }, (_, index) => comment(String(index)))
      .reduce<LiveComment[]>((rows, next) => appendLiveComment(rows, next), [])
    expect(comments).toHaveLength(80)
    expect(comments[0].id).toBe(String(total - 80))
    expect(comments.at(-1)?.id).toBe(String(total - 1))
    const css = readFileSync('src/platform/screens/live.css', 'utf8')
    expect(css).toMatch(/pl-live--performer\[data-phase='live'\]\[data-layout='phone-portrait'\] \.pl-live__stage\s*\{[^}]*position: absolute/)
    expect(css).toMatch(/pl-live--performer\[data-phase='live'\]\[data-layout='phone-portrait'\] \.pl-live__comments-wrap\s*\{[^}]*position: absolute/)
  })

  it('only treats the comment list as pinned when it is near the latest entry', () => {
    expect(isNearCommentEnd({ scrollHeight: 500, scrollTop: 300, clientHeight: 180 })).toBe(true)
    expect(isNearCommentEnd({ scrollHeight: 500, scrollTop: 120, clientHeight: 180 })).toBe(false)
  })

  it('shows the latest-comment affordance only for inserts, not realtime deletes', () => {
    expect(hasIncomingLiveComment(12, 13)).toBe(true)
    expect(hasIncomingLiveComment(12, 11)).toBe(false)
    expect(hasIncomingLiveComment(12, 12)).toBe(false)
  })

  it('scopes reads, writes, and realtime inserts to the active LIVE session', () => {
    const api = readFileSync('src/platform/lib/api.ts', 'utf8')
    expect(api).toContain(".eq('live_session_id', liveSessionId)")
    expect(api).toContain('live_session_id: input.liveSessionId ?? null')
    expect(api).toContain('if (row.live_session_id === liveSessionId) handlers.onInsert(row)')
    expect(api).toContain("{ event: 'DELETE', schema: 'public', table: 'live_comments' }")
  })

  it('provides performer and moderator controls plus a latest-comment affordance', () => {
    const performer = readFileSync('src/platform/screens/PerformerLiveScreen.tsx', 'utf8')
    const viewer = readFileSync('src/platform/screens/LiveWatchScreen.tsx', 'utf8')
    for (const screen of [performer, viewer]) {
      expect(screen).toContain('commentScroll.hasNewComments')
      expect(screen).toContain('最新コメント')
      expect(screen).toContain('deleteLiveComment')
      expect(screen).toContain('muteLiveCommentUser')
    }
    expect(viewer).toContain('canModerateLiveComments')
    expect(performer).toContain('canModerateLiveComments')
    expect(performer).toContain('canModerate ? <div className="pl-live__comment-actions">')
    expect(viewer).not.toContain("setError(e instanceof Error ? e.message : 'コメント失敗')")
  })

  it('adds non-destructive, session-scoped RLS policies', () => {
    const migration = readFileSync('supabase/migrations/20261016142951_live_comment_moderation.sql', 'utf8').toLowerCase()
    expect(migration).toContain('live_comments_moderator_delete')
    expect(migration).toContain('live_comment_mutes')
    expect(migration).toContain('live_comment_moderators')
    expect(migration).toContain('replica identity full')
    expect(migration).toContain('revoke all on public.live_comments from anon, authenticated')
    expect(migration).not.toMatch(/\btruncate\s+(table\s+)?public\.|\bdelete\s+from\b|\bdrop\s+table\b/)
  })
})
