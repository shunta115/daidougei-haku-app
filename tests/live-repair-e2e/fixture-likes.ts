// Browser-only adapter for visual QA. Never claims real Supabase transport.
const key='haku-qa-like-total', batches='haku-qa-like-batches'
const bus=new BroadcastChannel('haku-live-repair-likes')
export async function getLiveLikeTotal() {return Number(localStorage.getItem(key)||0)}
export async function sendLiveLikeBatch(_p:string,_s:string,id:string,count:number) {
  if ((window as any).__qaOffline) throw new Error('offline QA')
  return navigator.locks.request('haku-qa-like-lock',async()=>{
    const seen=JSON.parse(localStorage.getItem(batches)||'[]') as string[]
    let total=await getLiveLikeTotal()
    if(!seen.includes(id)) {total+=count;seen.push(id);localStorage.setItem(batches,JSON.stringify(seen));localStorage.setItem(key,String(total))}
    bus.postMessage(total);return total
  })
}
export function subscribeLiveLikeTotal(_p:string,_s:string,fn:(n:number)=>void,ready:()=>void) {const listener=(event:MessageEvent)=>fn(event.data);bus.addEventListener('message',listener);ready();return ()=>bus.removeEventListener('message',listener)}
