import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
const here=(name:string)=>fileURLToPath(new URL(name,import.meta.url))
export default defineConfig({
 plugins:[{name:'live-repair-isolation',enforce:'pre',resolveId(source){
  if(source === './api' || /\/lib\/api$/.test(source))return here('./fixture-api.ts')
  if(/\/lib\/auth$/.test(source))return here('./fixture-auth.ts')
  if(/\/lib\/livekit$/.test(source))return here('./fixture-livekit.ts')
  if(/\/lib\/track$/.test(source))return here('./fixture-track.ts')
  if(source==='./liveLikes')return here('./fixture-likes.ts')
 }},react()],
 server:{host:'127.0.0.1',port:4187,strictPort:true},
 build:{outDir:'dist-live-qa',rollupOptions:{input:here('./harness.html')}},
 optimizeDeps:{entries:['tests/live-repair-e2e/harness.html']},
})
