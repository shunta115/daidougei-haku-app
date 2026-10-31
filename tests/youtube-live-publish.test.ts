import { beforeEach, describe, expect, it, vi } from 'vitest'
import { saveYouTubeLiveSettings, youtubeLivePublishError } from '../src/platform/lib/youtubeLivePublish'
const mock = vi.hoisted(() => ({ getUser: vi.fn(), from: vi.fn(), update: vi.fn(), profile: vi.fn(), save: vi.fn() }))
vi.mock('../src/platform/lib/supabase', () => ({ requireSupabase: () => ({ auth: { getUser: mock.getUser }, from: mock.from }) }))
const settings = { youtube_live_video_id: 'yk6Kjl0WHWs', youtube_live_url: 'https://www.youtube.com/watch?v=yk6Kjl0WHWs', youtube_live_enabled: true }
beforeEach(() => {
  vi.clearAllMocks()
  mock.getUser.mockResolvedValue({data:{user:{id:'owner'}},error:null})
  mock.profile.mockResolvedValue({data:{id:'owner',status:'active'},error:null})
  mock.save.mockResolvedValue({data:settings,error:null})
  mock.from.mockImplementation(table => table === 'profiles' ? {select: () => ({eq: () => ({maybeSingle:mock.profile})})} : {update: mock.update})
  mock.update.mockImplementation(() => ({eq: () => ({select: () => ({maybeSingle:mock.save})})}))
})
describe('YouTube LIVE authenticated save boundary', () => {
  it('validates session and profile and saves only the three YouTube fields', async () => {
    expect(await saveYouTubeLiveSettings('owner', {...settings,is_live:true} as typeof settings)).toEqual(settings)
    expect(mock.update).toHaveBeenCalledWith(settings)
    expect(mock.getUser).toHaveBeenCalledOnce()
  })
  it('rejects another performer ID before any database query', async () => {
    await expect(saveYouTubeLiveSettings('other',settings)).rejects.toMatchObject({kind:'permission'})
    expect(mock.from).not.toHaveBeenCalled()
  })
  it('rejects a missing session', async () => {
    mock.getUser.mockResolvedValue({data:{user:null},error:null})
    await expect(saveYouTubeLiveSettings('owner',settings)).rejects.toMatchObject({kind:'authentication'})
    expect(mock.update).not.toHaveBeenCalled()
  })
  it('rejects an inactive or missing profile', async () => {
    for (const data of [null,{id:'owner',status:'suspended'}]) {
      mock.profile.mockResolvedValue({data,error:null})
      await expect(saveYouTubeLiveSettings('owner',settings)).rejects.toMatchObject({kind:'permission'})
    }
    expect(mock.update).not.toHaveBeenCalled()
  })
  it('rejects mismatched IDs or arbitrary URLs before saving', async () => {
    for (const patch of [{...settings,youtube_live_url:'https://evil.example'}, {...settings,youtube_live_video_id:'abcdefghijk'}]) {
      await expect(saveYouTubeLiveSettings('owner',patch)).rejects.toMatchObject({kind:'invalid'})
    }
    expect(mock.update).not.toHaveBeenCalled()
  })
  it('treats zero returned rows as denied rather than success', async () => {
    mock.save.mockResolvedValue({data:null,error:null})
    await expect(saveYouTubeLiveSettings('owner',settings)).rejects.toMatchObject({kind:'permission'})
  })
  it.each([
    [{code:'23514',message:'secret row data',details:'private'},'database'],
    [{code:'42501'},'permission'],
    [{code:'PGRST301'},'authentication'],
    [{message:'TypeError: Load failed'},'network'],
  ])('classifies database response %j safely', async (error,kind) => {
    mock.save.mockResolvedValue({data:null,error})
    await expect(saveYouTubeLiveSettings('owner',settings)).rejects.toMatchObject({kind})
    expect(youtubeLivePublishError(error)).not.toMatch(/secret|private/)
  })
  it('keeps an auth network failure distinct from an expired session', async () => {
    mock.getUser.mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(saveYouTubeLiveSettings('owner',settings)).rejects.toMatchObject({kind:'network'})
  })
})
