// Local-only Supabase boundary; no credentials and no external writes.
let saved = { youtube_live_video_id: null as string | null, youtube_live_url: null as string | null, youtube_live_enabled: false }
declare global { interface Window { __failure?: string; __writes: number; __saved?: typeof saved } }
window.__writes = 0
export function requireSupabase() {
  return {
    auth: { getUser: async () => ({data:{user:window.__failure === 'authentication' ? null : {id:'owner'}},error:null}) },
    from: (table: string) => table === 'profiles'
      ? { select: () => ({eq: () => ({maybeSingle: async () => ({data:{id:'owner',status:'active'},error:null})})}) }
      : { update: (patch: Partial<typeof saved>) => ({eq: () => ({select: () => ({maybeSingle: async () => {
          await new Promise(resolve => setTimeout(resolve,100))
          if (window.__failure === 'network') throw new TypeError('Load failed')
          if (window.__failure === 'database') return {data:null,error:{code:'23514',message:'private row details'}}
          if (window.__failure === 'permission') return {data:null,error:{code:'42501'}}
          saved = {...saved,...patch}; window.__writes++; window.__saved = saved
          return {data:saved,error:null}
        }})})}) },
  }
}
