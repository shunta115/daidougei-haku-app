const $=id=>document.getElementById(id);
const state={role:'viewer',orientation:'portrait',quality:'自動',mic:true,follow:false,comments:true,gifts:true,likes:0,ended:false};
const demoComments=[['Sakura','すごい！🎉'],['kenta','めっちゃいいですね！'],['Yuki','応援してます！'],['Mina','👏👏👏'],['Takahiro','素晴らしいパフォーマンス！'],['aya','最高です！']];
function addComment(name,message){
 const p=document.createElement('p'),b=document.createElement('b');
 b.textContent=name+'　';p.append(b,document.createTextNode(message));
 $('chat').append(p);$('chat').scrollTop=$('chat').scrollHeight;
 while($('chat').children.length>25)$('chat').firstElementChild.remove();
}
for(const [name,msg] of demoComments)addComment(name,msg);
function toast(message){$('notice').textContent=message;$('notice').classList.remove('hidden');setTimeout(()=>$('notice').classList.add('hidden'),2200)}
function render(){
 const host=state.role==='host';
 $('hostControls').classList.toggle('hidden',!host);
 $('composer').classList.toggle('hidden',host);
 $('right').classList.toggle('hidden',false);
 $('flip').classList.toggle('hidden',!host);
 $('mic').classList.toggle('hidden',!host);
 $('effects').classList.toggle('hidden',!host);
 $('like').classList.toggle('hidden',host);
 $('gift').classList.toggle('hidden',host||!state.gifts);
 $('chat').classList.toggle('hidden',!state.comments||host);
 $('switchRole').textContent=host?'視聴者画面へ':'配信者画面へ';
 $('follow').classList.toggle('hidden',host);
 $('follow').textContent=state.follow?'フォロー中':'＋フォロー';
 $('status').textContent=(state.orientation==='portrait'?'縦型 9:16':'横型 16:9')+' · '+state.quality;
 $('app').classList.toggle('landscape',state.orientation==='landscape');
 $('portrait').setAttribute('aria-pressed',String(state.orientation==='portrait'));
 $('landscape').setAttribute('aria-pressed',String(state.orientation==='landscape'));
 document.querySelectorAll('[data-quality]').forEach(x=>x.setAttribute('aria-pressed',String(x.dataset.quality===state.quality)));
 $('mic').textContent=state.mic?'🎙':'🔇';
 $('commentsEnabled').checked=state.comments;$('giftsEnabled').checked=state.gifts;
}
$('switchRole').onclick=()=>{state.role=state.role==='host'?'viewer':'host';render()};
$('settingsBtn').onclick=$('hostSettings').onclick=()=>{$('settings').classList.remove('hidden')};
$('closeSettings').onclick=()=>{$('settings').classList.add('hidden')};
$('applySettings').onclick=()=>{
 state.comments=$('commentsEnabled').checked;state.gifts=$('giftsEnabled').checked;
 $('settings').classList.add('hidden');render();
};
$('portrait').onclick=()=>{state.orientation='portrait';render()};
$('landscape').onclick=()=>{state.orientation='landscape';render()};
document.querySelectorAll('[data-quality]').forEach(el=>el.onclick=()=>{state.quality=el.dataset.quality;render()});
$('send').onclick=()=>{const text=$('comment').value.trim();if(!text)return;addComment('あなた',text);$('comment').value=''};
$('comment').onkeydown=e=>{if(e.key==='Enter'){$('send').click();e.preventDefault()}};
$('follow').onclick=()=>{state.follow=!state.follow;render();toast(state.follow?'フォローしました（デモ）':'フォロー解除（デモ）')};
$('like').onclick=()=>{state.likes++;$('feverCount').textContent=(12340+state.likes).toLocaleString('ja-JP');toast('♡ 応援ありがとう！（デモ）')};
$('gift').onclick=()=>toast('🎁 ギフト機能は本番に未接続です');
$('flip').onclick=()=>toast('カメラ切替：実端末との接続前のUIデモ');
$('mic').onclick=()=>{state.mic=!state.mic;render();toast('マイク表示切替（デモ）')};
$('effects').onclick=()=>toast('エフェクト：実装接続待ち');
$('end').onclick=()=>{$('confirm').classList.remove('hidden')};
$('cancelEnd').onclick=()=>{$('confirm').classList.add('hidden')};
$('confirmEnd').onclick=()=>{$('confirm').classList.add('hidden');toast('LIVE終了の確認UI（デモ）')};
$('closeMini').onclick=()=>{$('mini').classList.add('hidden')};
$('notice').onclick=()=>{$('notice').classList.add('hidden')};
window.addEventListener('keydown',e=>{if(e.key==='Escape'){$('settings').classList.add('hidden');$('confirm').classList.add('hidden')}});
render();
