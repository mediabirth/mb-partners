/** 無音B実測: 案件レーン移動の楽観反映（確定押下→カード即移動）と失敗時ロールバック＋明示トースト。残置ゼロ。 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'
const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()]}))
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}})
const BASE='http://localhost:4599', PW='CcOb!2026xx', OWNER='cc-ob-owner@mb-system.internal'
let pass=0,fail=0; const ok=(c:boolean,n:string,d='')=>{c?(pass++,console.log('  ✓',n)):(fail++,console.log('  ✗',n,d))}
async function cleanup(){
  const {data:ds}=await admin.from('deals').select('id').like('customer_name','CCOB%')
  for(const d of ds??[]){await admin.from('deal_items').delete().eq('deal_id',d.id);await admin.from('deals').delete().eq('id',d.id)}
  const {data:svc}=await admin.from('services').select('id').eq('name','CC-OBブランド').maybeSingle()
  if(svc)await admin.from('services').delete().eq('id',svc.id)
  const {data:l}=await admin.auth.admin.listUsers()
  const u=(l?.users||[]).find((x:any)=>x.email===OWNER)
  if(u){await admin.from('profiles').delete().eq('id',u.id);await admin.auth.admin.deleteUser(u.id).catch(()=>{})}
}
await cleanup()
const c=await admin.auth.admin.createUser({email:OWNER,password:PW,email_confirm:true,app_metadata:{role:'owner'}})
await admin.from('profiles').upsert({id:c.data!.user!.id,name:'CC-OB運営',role:'owner',email:OWNER,color:'#888'})
const svcId=(await admin.from('services').insert({name:'CC-OBブランド',active:true,icon:'🧪',color:'#4733E6'}).select('id').single()).data!.id
const sysPid=(await admin.from('partners').select('id').eq('is_system',true).limit(1)).data![0].id
await admin.from('deals').insert({partner_id:sysPid,service_id:svcId,customer_name:'CCOB移動',channel:'cooperation',source:'partner_form',consent:true,status:'received'})
await admin.from('deals').insert({partner_id:sysPid,service_id:svcId,customer_name:'CCOB失敗',channel:'cooperation',source:'partner_form',consent:true,status:'received'})

const b=await chromium.launch()
const p=await (await b.newContext({viewport:{width:1440,height:900}})).newPage()
await p.goto(BASE+'/console',{waitUntil:'domcontentloaded'});await p.waitForTimeout(1500)
await p.locator('input[type="email"]').fill(OWNER);await p.locator('input[type="password"]').fill(PW)
await p.locator('button[type="submit"]').first().click();await p.waitForTimeout(2800)
await p.goto(BASE+'/console/deals',{waitUntil:'domcontentloaded'});await p.waitForTimeout(3000)
const laneOf=async(name:string)=>await p.evaluate(`(()=>{
  const card=[...document.querySelectorAll('b')].find(b=>b.textContent.includes('${name}')); if(!card) return null
  const cx=card.getBoundingClientRect().x
  const heads=[...document.querySelectorAll('span')].filter(s=>['受付','商談中','進行中'].includes(s.textContent.trim())&&s.getBoundingClientRect().width>0)
  let best=null,bd=1e9
  for(const h of heads){const d=Math.abs(h.getBoundingClientRect().x-cx); if(d<bd){bd=d;best=h.textContent.trim()}}
  return best })()`) as string|null
// 1) 楽観移動: 受付→商談中（drag→確認モーダル→移動する→即時反映）
await p.locator('b:has-text("CCOB移動")').first().dragTo(p.locator('text=商談中').first())
await p.waitForTimeout(600)
const confirmBtn=p.locator('.modal-pop button:has-text("移動する"), button:has-text("移動する")')
ok((await confirmBtn.count())>0,'結果予告モーダル（ripple）表示')
// 単一routeハンドラをモード切替（delay=遅延通過/fail=500/pass=素通し）で共用（多重route登録の競合を回避）
let routeMode:'delay'|'fail'|'pass'='delay'
await p.route('**/api/console/deals/*',async r=>{
  if(r.request().method()!=='PATCH'){await r.continue();return}
  if(routeMode==='delay'){await new Promise(res=>setTimeout(res,1200));await r.continue()}
  else if(routeMode==='fail'){await new Promise(res=>setTimeout(res,600));await r.fulfill({status:500,contentType:'application/json',body:'{"error":"検証用の失敗"}'})}
  else await r.continue()
})
const t0=Date.now()
await confirmBtn.first().click()
let movedAt=-1
while(Date.now()-t0<3000){ const lane=await laneOf('CCOB移動'); if(lane&&lane.includes('商談中')){movedAt=Date.now()-t0;break}; await p.waitForTimeout(16) }
ok(movedAt>=0&&movedAt<300,`楽観反映: 押下→カード移動 ${movedAt}ms（サーバ1200ms遅延中に反映=同期待ちなし）`,String(movedAt))
await p.waitForTimeout(1800)
// 2) 失敗ロールバック: PATCHを500で落とす→カードが受付に戻る＋明示トースト
routeMode='fail'
await p.locator('b:has-text("CCOB失敗")').first().dragTo(p.locator('text=商談中').first())
await p.waitForTimeout(600)
await p.locator('button:has-text("移動する")').first().click()
await p.waitForTimeout(250)
const laneMid=await laneOf('CCOB失敗')
ok(!!laneMid&&laneMid.includes('商談中'),'失敗前に楽観反映されている',String(laneMid))
await p.waitForTimeout(1500)
const laneAfter=await laneOf('CCOB失敗')
ok(!!laneAfter&&laneAfter.includes('受付'),'失敗→受付へロールバック',String(laneAfter))
ok((await p.locator('text=元の状態に戻しました').count())>0,'明示トースト表示')
const {data:st}=await admin.from('deals').select('status').eq('customer_name','CCOB失敗').single()
ok(st!.status==='received','DBも不変（received）')
await b.close(); await cleanup()
console.log(`\n== optimistic: pass=${pass} fail=${fail}`)
process.exit(fail?1:0)
