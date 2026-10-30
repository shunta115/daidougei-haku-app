import React from 'react'
import { createRoot } from 'react-dom/client'
import { useEffect,useState } from 'react'
import { HomeEditor } from '../../../src/platform/components/official-home/HomeEditor'
import { HomeGallery,PublicHomeSections,BookingForm } from '../../../src/platform/components/official-home/PublicHome'
import { BookingCases } from '../../../src/haku-admin/BookingCases'
import { homeRead,type HomeData } from '../../../src/platform/lib/officialHome'
const OWNER='10000000-0000-4000-8000-000000000001'
function Fixture(){
 const [mode,setMode]=useState('edit');const [data,setData]=useState<HomeData|null>(null);const [booking,setBooking]=useState(false)
 useEffect(()=>{if(mode==='public')void homeRead(OWNER).then(setData)},[mode])
 return <main style={{maxWidth:1000,margin:'auto',padding:20,fontFamily:'sans-serif',background:'#fff'}}><p>ローカル検証専用 / 実データ・外部送信なし</p><nav>{['edit','public','admin'].map(m=><button key={m} onClick={()=>{sessionStorage.setItem('test-role',m==='admin'?'30000000-0000-4000-8000-000000000003':OWNER);setMode(m)}}>{m}</button>)}</nav>
 {mode==='edit'?<HomeEditor performerId={OWNER}/>:mode==='admin'?<BookingCases/>:data?<><HomeGallery photos={data.assets.filter(a=>a.kind==='photo')} name="検証用パフォーマー" hero/><h1>検証用パフォーマー</h1><button onClick={()=>setBooking(true)}>出演を依頼する</button><PublicHomeSections assets={data.assets} details={data.home?.details||{}}/>{booking?<BookingForm performerId={OWNER} name="検証用パフォーマー" onClose={()=>setBooking(false)}/>:null}</>:null}</main>
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
