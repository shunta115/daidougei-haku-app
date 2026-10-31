import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
const config=JSON.parse(readFileSync('/private/tmp/haku115-test-publishable.json','utf8'))
if(new URL(config.url).hostname!=='aeqskxxykzapgaudbeqa.supabase.co')throw Error('TEST only')
export default defineConfig({plugins:[react()],define:{'import.meta.env.VITE_SUPABASE_URL':JSON.stringify(config.url),'import.meta.env.VITE_SUPABASE_ANON_KEY':JSON.stringify(config.key)},server:{host:'127.0.0.1',port:4197,strictPort:true},optimizeDeps:{entries:['tests/integration115-real/index.html']}})
