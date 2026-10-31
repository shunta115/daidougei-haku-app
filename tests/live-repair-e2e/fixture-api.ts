import type { LiveComment } from '../../src/platform/lib/types'
export const performer: any = { id:'10000000-0000-4000-8000-000000000001', stage_name:'QA LIVE',is_live:true,is_approved:true,is_private_test:false,live_started_at:'2026-10-31T00:00:00Z',photo_url:null,genre:'TEST',live_title:'隔離テスト',share_location:false }
const bus = new BroadcastChannel('haku-live-repair-comments')
const listeners = new Set<any>()
const readComments = (): LiveComment[] => JSON.parse(localStorage.getItem('qa-live-comments') || '[]')
bus.onmessage = event => { if(event.data.kind==='comment') listeners.forEach(fn=>fn.onInsert(event.data.row)) }
export async function getPerformer() { return {...performer} }
export function subscribePerformerLive(_id: string, fn:any) { const listener=(event:MessageEvent)=>{if(event.data.kind==='ended') {performer.is_live=false;fn({is_live:false})}}; bus.addEventListener('message',listener);return ()=>bus.removeEventListener('message',listener) }
export async function getActiveLiveSessionId() { return performer.is_live ? 'session-qa' : null }
export async function listLiveComments() { return readComments().slice(-80) }
export async function postLiveComment(input:any) { const row={id:crypto.randomUUID(), performer_id:performer.id,live_session_id:'session-qa',user_id:input.userId,display_name:input.displayName,body:input.body,created_at:new Date().toISOString()};const comments=readComments();comments.push(row);localStorage.setItem('qa-live-comments',JSON.stringify(comments));bus.postMessage({kind:'comment',row});listeners.forEach(fn=>fn.onInsert(row)) }
export function subscribeLiveComments(_p:string,_s:string,handlers:any) { listeners.add(handlers);handlers.onReady?.();return ()=>listeners.delete(handlers) }
export async function deleteLiveComment() {}
export async function muteLiveCommentUser() {}
export async function canModerateLiveComments() {return false}
export async function follow() {localStorage.setItem('qa-follow','1')}
export async function unfollow() {localStorage.removeItem('qa-follow')}
export async function isFollowing() {return localStorage.getItem('qa-follow')==='1'}
export async function updateLiveViewerPeak() {}
export function subscribeLiveTipEvents() {return ()=>{}}
export async function listRecentLiveTipEvents() {return []}
export async function listPerformerLiveSchedules() {return []}
export function liveReservationsEnabled() {return false}
export async function createLiveSchedule() {throw new Error('QA disabled')}
export async function notifyLiveReservationStarted() {}
export async function startLive() {throw new Error('QA cannot start LIVE')}
export async function endLive() {throw new Error('QA cannot end LIVE')}
export async function updatePerformer() {throw new Error('QA cannot update performer')}
export function qaEnd() {performer.is_live=false;bus.postMessage({kind:'ended'})}
