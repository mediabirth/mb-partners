// 通水P2検証: 詳細ドロワーの遅延分割が「挙動・money不変」であること。
//   throwaway受付案件を作成→コンソールボードでカードを開く→ドロワーが on-demand chunk で描画→P&L/報酬/タイムライン表示→money不変→撤去。
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { chromium } from 'playwright'
const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim()]}))
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} })
const BASE='http://localhost:3100'
let pass=0, fail=0
const ok=(c,n,d='')=>{ if(c){pass++;console.log('  ✓',n)} else {fail++;console.log('  ✗',n,String(d).slice(0,200))} }
async function cookie(email,name){ const {data:link}=await admin.auth.admin.generateLink({type:'magiclink',email}); const tmp=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{auth:{persistSession:false}}); const {data:vfy}=await tmp.auth.verifyOtp({type:'magiclink',token_hash:link.properties.hashed_token}); const jar={}; const ssr=createServerClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{cookieOptions:{name},cookies:{getAll:()=>Object.entries(jar).map(([n,v])=>({name:n,value:v})),setAll:(a)=>a.forEach(({name:n,value:v})=>{jar[n]=v})}}); await ssr.auth.setSession({access_token:vfy.session.access_token,refresh_token:vfy.session.refresh_token}); return Object.entries(jar).map(([n,v])=>({name:n,value:v,domain:'localhost',path:'/',secure:false,sameSite:'Lax'})) }
async function moneyHash(){ const {data:mr}=await admin.from('menu_rewards').select('reward_value'); const sum=(mr??[]).reduce((s,r)=>s+Number(r.reward_value),0); const {count}=await admin.from('deals').select('id',{count:'exact',head:true}).eq('created_by','bfb3c027-b460-4aad-93a2-66fadf5a78b1'); return {sum, rows:mr?.length, katsu:count} }
const F={ pUid:null, pId:null, aUid:null, dealId:null }
const CUST='P2ドロワー検証株式会社'
let browser=null, fatal=null
try {
  const m0=await moneyHash()
  const { data: svc } = await admin.from('services').select('id, name').limit(1).single()
  const { data: menu } = await admin.from('service_menus').select('*').eq('service_id', svc.id).order('sort').limit(1).maybeSingle()
  const pu=await admin.auth.admin.createUser({email:'cc-p2-partner-throwaway@mb-system.internal',password:'x',email_confirm:true,app_metadata:{role:'partner'}}); F.pUid=pu.data.user.id
  await admin.from('profiles').insert({id:F.pUid,name:'P2P',role:'partner',email:'cc-p2-partner-throwaway@mb-system.internal',color:'#888'})
  const pr=await admin.from('partners').insert({profile_id:F.pUid,code:'P2DRAWER',status:'active'}).select('id').single(); F.pId=pr.data.id
  const amount = menu?.ref_type === 'fixed' ? Number(menu.ref_value) : 0
  const dl=await admin.from('deals').insert({ partner_id:F.pId, service_id:svc.id, menu_id:menu?.id??null, customer_name:CUST, channel:'referral', source:'link', status:'received', consent:true, amount, reward_snapshot:menu??null, created_by:null }).select('id').single()
  F.dealId=dl.data.id
  const au=await admin.auth.admin.createUser({email:'cc-p2-admin-throwaway@mb-system.internal',password:'x',email_confirm:true,app_metadata:{role:'owner'}}); F.aUid=au.data.user.id
  await admin.from('profiles').insert({id:F.aUid,name:'P2A',role:'owner',email:'cc-p2-admin-throwaway@mb-system.internal',color:'#888'})

  browser=await chromium.launch()
  const ctx=await browser.newContext({viewport:{width:1440,height:900}}); await ctx.addCookies(await cookie('cc-p2-admin-throwaway@mb-system.internal','mb-auth-console'))
  const pg=await ctx.newPage(); pg.on('pageerror',e=>console.log('  console err:',String(e).slice(0,140)))
  const jsChunks=new Set()
  pg.on('response', r=>{ const u=r.url(); if(u.includes('/_next/static/chunks/')&&u.endsWith('.js')) jsChunks.add(u.split('/').pop()) })
  await pg.goto(`${BASE}/console/deals`,{waitUntil:'networkidle'}); await pg.waitForTimeout(2500)
  const boardText=await pg.evaluate(()=>document.body.innerText)
  ok(boardText.includes(CUST), 'ボードに受付案件カードが表示', boardText.slice(0,80).replace(/\n/g,' '))
  const beforeClick=new Set(jsChunks)
  // カードを開く（顧客名テキストをクリック→祖先divのonClick=setSelected発火）
  await pg.getByText(CUST).first().click().catch(()=>{})
  await pg.waitForTimeout(2000)
  const newChunks=[...jsChunks].filter(c=>!beforeClick.has(c))
  ok(newChunks.length>0, 'カード押下で遅延ドロワーchunkが追加取得（on-demand実証）', 'new:'+newChunks.join(','))
  const drawerText=await pg.evaluate(()=>document.body.innerText)
  ok(drawerText.includes(CUST) && drawerText.includes('受付'), 'ドロワー描画: お客さま名＋進行タイムライン（受付）', '')
  // 受付案件のドロワーは StatusTimeline（受付→対応中→成約→支払済の全段）を描画＝ボードには無いドロワー固有要素で確証。
  ok(drawerText.includes('対応中') && drawerText.includes('成約') && drawerText.includes('支払済'), 'ドロワー描画: 進行タイムライン全段（ドロワー固有）', drawerText.slice(0,120).replace(/\n/g,' '))
  await pg.screenshot({path:'docs/reports/screens_integrity/p2_drawer.png',fullPage:false})
  await ctx.close()
  const m1=await moneyHash()
  ok(m0.sum===m1.sum && m0.sum===340100 && m0.rows===16, 'money不変: menu_rewards 16行/¥340,100', JSON.stringify(m1))
  ok(m0.katsu===m1.katsu && m1.katsu===3, 'money不変: 勝彦deals=3', JSON.stringify(m1))
} catch(e){ fatal=e }
finally {
  try {
    if(F.dealId) await admin.from('deals').delete().eq('id',F.dealId)
    if(F.pId) await admin.from('partners').delete().eq('id',F.pId)
    for(const uid of [F.pUid,F.aUid].filter(Boolean)){ await admin.from('profiles').delete().eq('id',uid); await admin.auth.admin.deleteUser(uid) }
    const tw=await admin.from('profiles').select('id',{count:'exact',head:true}).like('email','%throwaway%')
    console.log('teardown: throwaway残=',tw.count)
  } catch(e2){ console.log('teardown err:', e2?.message) }
  if(browser) await browser.close().catch(()=>{})
  if(fatal){ console.log('FATAL:',fatal?.message); console.log(String(fatal?.stack).slice(0,400)) }
  console.log(`RESULT: ${pass} passed / ${fail} failed`)
}
