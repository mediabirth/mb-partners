// 本番スモーク（勝彦承認済）: ①/app/settings stamp=ed3461f 実測 ②通水P1 本番一気通貫（共有リンク→/r/セルフ登録→帰属deal→growth反映→撤去）。
// throwawayのみ・顧客メール未入力（外部顧客への実送信ゼロ）・実データ操作禁止則遵守・money不変。
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { chromium } from 'playwright'
const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim()]}))
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} })
const APP='https://mb-partners.app', CONSOLE='https://console.mb-partners.app'
let pass=0, fail=0
const ok=(c,n,d='')=>{ if(c){pass++;console.log('  ✓',n)} else {fail++;console.log('  ✗',n,String(d).slice(0,200))} }
async function cookie(email,name,host){ const {data:link}=await admin.auth.admin.generateLink({type:'magiclink',email}); const tmp=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{auth:{persistSession:false}}); const {data:vfy}=await tmp.auth.verifyOtp({type:'magiclink',token_hash:link.properties.hashed_token}); const jar={}; const ssr=createServerClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{cookieOptions:{name},cookies:{getAll:()=>Object.entries(jar).map(([n,v])=>({name:n,value:v})),setAll:(a)=>a.forEach(({name:n,value:v})=>{jar[n]=v})}}); await ssr.auth.setSession({access_token:vfy.session.access_token,refresh_token:vfy.session.refresh_token}); return Object.entries(jar).map(([n,v])=>({name:n,value:v,domain:host,path:'/',secure:true,sameSite:'Lax'})) }
async function money(){ const {data:mr}=await admin.from('menu_rewards').select('reward_value'); const {count}=await admin.from('deals').select('id',{count:'exact',head:true}).eq('created_by','bfb3c027-b460-4aad-93a2-66fadf5a78b1'); return {sum:(mr??[]).reduce((s,r)=>s+Number(r.reward_value),0), rows:mr?.length, katsu:count} }
const F={ pUid:null, pId:null, aUid:null, token:null, dealId:null }
const CUST='本番スモーク顧客株式会社'
let browser=null, fatal=null
try {
  const m0=await money()
  const pu=await admin.auth.admin.createUser({email:'cc-smoke-partner-throwaway@mb-system.internal',password:'x',email_confirm:true,app_metadata:{role:'partner'}}); F.pUid=pu.data.user.id
  await admin.from('profiles').insert({id:F.pUid,name:'スモークP',role:'partner',email:'cc-smoke-partner-throwaway@mb-system.internal',color:'#888'})
  const pr=await admin.from('partners').insert({profile_id:F.pUid,code:'SMOKE01',status:'active'}).select('id').single(); F.pId=pr.data.id
  const au=await admin.auth.admin.createUser({email:'cc-smoke-admin-throwaway@mb-system.internal',password:'x',email_confirm:true,app_metadata:{role:'owner'}}); F.aUid=au.data.user.id
  await admin.from('profiles').insert({id:F.aUid,name:'スモークA',role:'owner',email:'cc-smoke-admin-throwaway@mb-system.internal',color:'#888'})

  browser=await chromium.launch()
  // ① stamp
  const pctx=await browser.newContext({viewport:{width:430,height:900}}); await pctx.addCookies(await cookie('cc-smoke-partner-throwaway@mb-system.internal','mb-auth-app','mb-partners.app'))
  const p=await pctx.newPage(); p.on('pageerror',e=>console.log('  app err:',String(e).slice(0,120)))
  await p.goto(`${APP}/app/settings`,{waitUntil:'networkidle'}); await p.waitForTimeout(1500)
  const st=await p.evaluate(()=>document.body.innerText)
  ok(st.includes('ed3461f'), '①本番stamp=ed3461f（/app/settings 実測）', (st.match(/build [0-9a-f]{7}[^\n]*/)||[''])[0])

  // ② 共有リンク発行（ブランド展開→共有シート）
  await p.goto(`${APP}/app/refer`,{waitUntil:'networkidle'}); await p.waitForTimeout(2500)
  // 実ブランド名でカードを展開→「紹介リンクを共有」を露出
  const NAMES=['MatchHub','MOOM','RESONATION','PRAGMATION','EMANATION','ENTERSOLOGY LIVE']
  let usedBrand=''
  for(const nm of NAMES){ const b=p.getByRole('button').filter({ hasText:nm }).first(); if(await b.count()){ await b.click().catch(()=>{}); await p.waitForTimeout(900); if(await p.getByRole('button',{name:'紹介リンクを共有'}).count()){ usedBrand=nm; break } } }
  const shareBtn=p.getByRole('button',{name:'紹介リンクを共有'}).first()
  ok(await shareBtn.count()>0, '②共有ボタン露出（本番）', `brand=${usedBrand}`)
  await shareBtn.click(); await p.waitForTimeout(2000)
  const url=await p.evaluate(()=>{ const m=document.body.innerText.match(/https?:\/\/[^\s]+\/r\/[a-z0-9]+/); return m?m[0]:null })
  F.token=url?url.split('/r/')[1]:null
  ok(!!F.token, '②/r/{token} 発行（本番）', String(url))
  const { data: rl } = F.token ? await admin.from('referral_links').select('partner_id').eq('token',F.token).maybeSingle() : {data:null}
  ok(rl?.partner_id===F.pId, '②referral_links にパートナー帰属', '')
  await pctx.close()

  // ③ 顧客セルフ登録（未認証・メール未入力＝外部送信ゼロ）
  const cctx=await browser.newContext({viewport:{width:430,height:900}}); const cp=await cctx.newPage()
  await cp.goto(`${APP}/r/${F.token}`,{waitUntil:'networkidle'}); await cp.waitForTimeout(2000)
  await cp.locator('input[placeholder="株式会社〇〇"]').fill(CUST).catch(()=>{})
  await cp.locator('input[placeholder="山田 太郎"]').fill('担当 太郎').catch(()=>{})
  await cp.locator('input[placeholder="09012345678"]').fill('09077776666').catch(()=>{})
  await cp.locator('input#consent').check().catch(()=>{})
  await cp.getByRole('button',{name:/無料で相談する|送信|登録/}).first().click().catch(()=>{})
  await cp.waitForTimeout(4000); await cctx.close()
  const { data: nd } = await admin.from('deals').select('id, partner_id, source, consent, customer_email').eq('partner_id',F.pId).order('created_at',{ascending:false}).limit(1).maybeSingle()
  F.dealId=nd?.id
  ok(!!nd && nd.partner_id===F.pId && nd.consent===true && (nd.source==='link'||nd.source==='qr'), '③本番セルフ登録→パートナー帰属deal', JSON.stringify({p:nd?.partner_id===F.pId,s:nd?.source}))
  ok(!nd?.customer_email, '③顧客メール未保存＝外部顧客への実送信なし', String(nd?.customer_email))

  // ④ growth 反映
  const actx=await browser.newContext({viewport:{width:1440,height:900}}); await actx.addCookies(await cookie('cc-smoke-admin-throwaway@mb-system.internal','mb-auth-console','console.mb-partners.app'))
  const ap=await actx.newPage(); ap.on('pageerror',e=>console.log('  console err:',String(e).slice(0,120)))
  await ap.goto(`${CONSOLE}/console/growth`,{waitUntil:'networkidle'}); await ap.waitForTimeout(2500)
  const g=await ap.evaluate(()=>document.body.innerText)
  ok(g.includes('SMOKE01'), '④growthダッシュボードに帰属パートナー反映', g.slice(0,120).replace(/\n/g,' '))
  await ap.screenshot({path:'docs/reports/screens_integrity/prod_smoke_growth.png',fullPage:true}); await actx.close()

  const m1=await money()
  ok(m0.sum===m1.sum && m1.sum===340100 && m1.rows===16 && m0.katsu===m1.katsu && m1.katsu===3, 'money不変: 16行/¥340,100・勝彦3', JSON.stringify(m1))
} catch(e){ fatal=e }
finally {
  try {
    if(F.dealId) await admin.from('deals').delete().eq('id',F.dealId)
    if(F.token) await admin.from('referral_links').delete().eq('token',F.token)
    if(F.pId){ await admin.from('funnel_events').delete().eq('partner_id',F.pId); await admin.from('partners').delete().eq('id',F.pId) }
    for(const uid of [F.pUid,F.aUid].filter(Boolean)){ await admin.from('profiles').delete().eq('id',uid); await admin.auth.admin.deleteUser(uid) }
    const tw=await admin.from('profiles').select('id',{count:'exact',head:true}).like('email','%throwaway%')
    console.log('teardown: throwaway残=',tw.count)
  } catch(e2){ console.log('teardown err:', e2?.message) }
  if(browser) await browser.close().catch(()=>{})
  if(fatal){ console.log('FATAL:',fatal?.message); console.log(String(fatal?.stack).slice(0,400)) }
  console.log(`RESULT: ${pass} passed / ${fail} failed`)
}
