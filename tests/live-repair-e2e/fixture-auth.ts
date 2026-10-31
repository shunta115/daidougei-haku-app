import { performer } from './fixture-api'
export function useAuth() {return {user:{id:new URLSearchParams(location.search).get('actor')||'viewer-a'},profile:{id:'host',display_name:'QAファン'},performer,refreshProfile:async()=>{}}}
