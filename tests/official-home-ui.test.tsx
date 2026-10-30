// @vitest-environment jsdom
import { fireEvent,render,screen,cleanup } from '@testing-library/react'
import { afterEach,describe,it,expect,vi } from 'vitest'
import { HomeDetailsView,HomeGallery,PublicHomeSections,BookingForm } from '../src/platform/components/official-home/PublicHome'
import type { HomeAsset } from '../src/platform/lib/officialHome'
vi.mock('../src/platform/lib/officialHome',()=>({assetUrl:(a:any,thumb:boolean,download:boolean)=>`/file/${a.id}?thumb=${!!thumb}&download=${!!download}`,homeWrite:vi.fn().mockResolvedValue({id:'test-case'})}))
const photo=(id:string,main=false):HomeAsset=>({id,performer_id:'test',kind:'photo',title:`写真${id}`,description:'',published:true,is_main:main,sort_order:0,video_id:null,updated_at:'2026-10-31T00:00:00Z',bytes:100})
afterEach(cleanup)
describe('official homepage UI',()=>{
 it('omits empty detail rows and renders plain text safely',()=>{render(<HomeDetailsView details={{space:'3m × 3m',equipment:'<script>test</script>'}}/>);expect(screen.getByText('必要スペース')).toBeTruthy();expect(screen.queryByText('経歴')).toBeNull();expect(screen.getByText('<script>test</script>')).toBeTruthy()})
 it('uses designated main photo and provides carousel, keyboard and dialog dismissal',()=>{render(<HomeGallery photos={[photo('one'),photo('two',true)]} name="テスト" hero/>);expect(screen.getByRole('img',{name:'写真two'}).getAttribute('src')).toContain('two');fireEvent.click(screen.getByRole('button',{name:'次の写真'}));expect(screen.getByRole('img',{name:'写真one'})).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'テストの写真を拡大'}));expect(screen.getByRole('dialog')).toBeTruthy();fireEvent.keyDown(document,{key:'Escape'});expect(screen.queryByRole('dialog')).toBeNull()})
 it('PDF downloads do not require client auth and expose title/update/description',()=>{const pdf={...photo('pdf'),kind:'pdf' as const,title:'宣材資料',description:'イベント向け'};render(<PublicHomeSections assets={[pdf]} details={{}}/>);expect(screen.getByRole('link',{name:/ダウンロード/}).getAttribute('href')).toContain('download=true');expect(screen.getByText('イベント向け')).toBeTruthy()})
 it('does not embed YouTube until visitor explicitly taps play',()=>{render(<PublicHomeSections assets={[]} details={{}} legacyVideo="https://youtu.be/abcdefghijk"/>);expect(document.querySelector('iframe')).toBeNull();fireEvent.click(screen.getByRole('button',{name:'パフォーマンス動画を再生'}));expect(document.querySelector('iframe')?.src).toContain('youtube-nocookie.com/embed/abcdefghijk')})
 it('booking fixes performer selection and explains office acceptance',()=>{render(<BookingForm performerId="test" name="テスト出演者" onClose={()=>{}}/>);expect((screen.getByLabelText('希望パフォーマー') as HTMLInputElement).readOnly).toBe(true);expect(screen.getByRole('button',{name:'HAKU事務局へ送信'})).toBeTruthy();expect(screen.getByLabelText('会社名・団体名 *')).toBeTruthy()})
})
