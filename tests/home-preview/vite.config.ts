import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
const here=(path:string)=>fileURLToPath(new URL(path,import.meta.url))
export default defineConfig({
 root:here('./'), publicDir:here('../../public'), envDir:here('./empty-env'),
 plugins:[{name:'home-preview-isolation',enforce:'pre',resolveId(source){
 if(/\/lib\/(api|homeDiscoveryApi)$/.test(source))return here('./api.ts')
 if(/\/lib\/auth$/.test(source))return here('./auth.ts')
 if(/\/lib\/track$/.test(source))return here('../e2e/fixture-track.ts')
 }},react()],
 build:{outDir:here('../../artifacts/home-preview-dist'),emptyOutDir:true,copyPublicDir:false},
 server:{host:'127.0.0.1',port:4188,strictPort:true,fs:{allow:[here('../../')]}}
})
