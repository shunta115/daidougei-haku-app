import type { LiveSchedule, Performer } from '../../src/platform/lib/types'
const now = Date.now()
export const sampleUser = {id:'sample-fan'}
const person = (id: string, name: string, photo: string, extra = {}) => ({id,stage_name:name,photo_url:photo,genre:'パフォーマンス',city:'東京',is_approved:true,is_live:false,created_at:new Date(now-100*86400000).toISOString(),updated_at:new Date(now).toISOString(),...extra}) as Performer
const photo='/events/award-winning-performers-2026/hero-performer.jpg'
const people=[person('one','サンプル出演者 A',photo,{is_live:true,live_title:'光とリズムのステージ'}),person('two','サンプル出演者 B','/official/media/media-stage-1.jpg'),person('three','サンプル出演者 C','/official/media/media-stage-2.jpg',{created_at:new Date(now-86400000).toISOString()})]
export const liveReservationsEnabled=true
export async function searchPerformers(){return people}
export async function listLivePerformers(){return new URLSearchParams(location.search).has('no-live') ? [] : [people[0]]}
export async function getFeaturedEvent(){return null}
export async function getTodayOfficialNavigator(){return null}
export async function listFollowedPerformers(){return []}
export async function listOshiPerformers(){return []}
export async function listUpcomingLiveSchedules(){return [{id:'sample-schedule',performer_id:'two',title:'週末のサーカス・ナイト',scheduled_start_at:new Date(now+30*60000).toISOString(),status:'scheduled'}] as LiveSchedule[]}
export async function listUpcomingPublishedAppearances(){return []}
export async function listHomeSessions(){return [{performer_id:'one',started_at:new Date(now-60000).toISOString(),ended_at:null,heartbeat_at:new Date(now).toISOString()}]}
let reserved: string[]=[]
export async function listOwnLiveReservationIds(){return [...reserved]}
export async function reserveLiveSchedule(id: string){reserved=[...new Set([...reserved,id])]}
export async function cancelLiveReservation(id: string){reserved=reserved.filter(x=>x!==id)}
