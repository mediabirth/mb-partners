// 通水P1検証: 共有リンク発行→顧客セルフ登録(/r/token)→パートナー帰属→ボード出現→ファネル記録→ダッシュボード。
// throwawayのみ・ローカル本番ビルド(RESEND不在=送信ゼロ)。
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
const F={ pUid:null, pId:null, aUid:null, token:null, dealId:null }
let browser=null, fatal=null
const CUST='通水検証顧客株式会社'
try {
  const pu=await admin.auth.admin.createUser({email:'cc-p1-partner-throwaway@mb-system.internal',password:'x',email_confirm:true,app_metadata:{role:'partner'}}); F.pUid=pu.data.user.id
  await admin.from('profiles').insert({id:F.pUid,name:'通水P',role:'partner',email:'cc-p1-partner-throwaway@mb-system.internal',color:'#888'})
  const pr=await admin.from('partners').insert({profile_id:F.pUid,code:'P1SHARE',status:'active'}).select('id').single(); F.pId=pr.data.id
  const au=await admin.auth.admin.createUser({email:'cc-p1-admin-throwaway@mb-system.internal',password:'x',email_confirm:true,app_metadata:{role:'owner'}}); F.aUid=au.data.user.id
  await admin.from('profiles').insert({id:F.aUid,name:'通水A',role:'owner',email:'cc-p1-admin-throwaway@mb-system.internal',color:'#888'})

  browser=await chromium.launch()
  console.log('[1] パートナー: 紹介リンクを共有（ブランド展開→共有シート→リンク発行）')
  const pctx=await browser.newContext({viewport:{width:430,height:900}}); await pctx.addCookies(await cookie('cc-p1-partner-throwaway@mb-system.internal','mb-auth-app')); const p=await pctx.newPage(); p.on('pageerror',e=>console.log('  app err:',String(e).slice(0,120)))
  await p.goto(`${BASE}/app/refer`,{waitUntil:'networkidle'}); await p.waitForTimeout(2000)
  // 最初のブランドを展開
  const brand=p.getByRole('button').filter({ hasText:'MatchHub' }).first()
  await brand.click().catch(()=>{}); await p.waitForTimeout(1000)
  const shareBtn=p.getByRole('button',{name:'紹介リンクを共有'}).first()
  ok(await shareBtn.count()>0, '共有ボタンが露出')
  await shareBtn.click(); await p.waitForTimeout(1500)
  const dlgText=await p.evaluate(()=>document.body.innerText)
  ok(dlgText.includes('を紹介する') && dlgText.includes('/r/'), '共有シート表示＋/r/リンク生成', dlgText.match(/\/r\/[a-z0-9]+/)?.[0]||'')
  // リンク抽出
  const url=await p.evaluate(()=>{ const m=document.body.innerText.match(/https?:\/\/[^\s]+\/r\/[a-z0-9]+/); return m?m[0]:null })
  F.token = url ? url.split('/r/')[1] : null
  ok(!!F.token, '/r/{token} URL 抽出', String(url))
  // referral_links にレコード
  const { data: rl } = await admin.from('referral_links').select('token, partner_id').eq('token', F.token).maybeSingle()
  ok(rl?.partner_id===F.pId, 'referral_links にパートナー帰属で発行')
  await p.screenshot({path:'docs/reports/screens_integrity/p1_share_sheet.png',fullPage:true})
  await pctx.close()

  console.log('[2] 顧客セルフ登録（/r/token・未認証）→ 同意→送信→帰属')
  const cctx=await browser.newContext({viewport:{width:430,height:900}}); const cp=await cctx.newPage(); cp.on('pageerror',e=>console.log('  r err:',String(e).slice(0,120)))
  await cp.goto(`${BASE}/r/${F.token}`,{waitUntil:'networkidle'}); await cp.waitForTimeout(1800)
  const rtext=await cp.evaluate(()=>document.body.innerText)
  ok(rtext.length>50 && !rtext.includes('見つかりません'), 'ランディング表示（landing_view計測）')
  // フォーム入力（B2B: 会社名=CUST・ご担当者名(必須)・電話・同意）
  await cp.locator('input[placeholder="株式会社〇〇"]').fill(CUST).catch(()=>{})
  await cp.locator('input[placeholder="山田 太郎"]').fill('担当 太郎').catch(()=>{})
  await cp.locator('input[placeholder="09012345678"]').fill('09099998888').catch(()=>{})
  await cp.locator('input#consent').check().catch(()=>{})
  await cp.screenshot({path:'docs/reports/screens_integrity/p1_landing.png',fullPage:true})
  await cp.getByRole('button',{name:/無料で相談する|送信|登録|完了/}).first().click().catch(()=>{})
  await cp.waitForTimeout(3500)
  await cctx.close()
  // DB: 帰属deal
  const { data: nd } = await admin.from('deals').select('id, partner_id, channel, source, status, consent, customer_name').eq('partner_id',F.pId).order('created_at',{ascending:false}).limit(1).maybeSingle()
  F.dealId=nd?.id
  ok(!!nd && nd.partner_id===F.pId, '顧客登録→パートナー帰属deal作成', JSON.stringify({p:nd?.partner_id,s:nd?.source}))
  ok(nd?.consent===true && (nd?.source==='link'||nd?.source==='qr'), '同意=true・source=link/qr（構造的に同意成立）')

  console.log('[3] ボード出現 + ファネル記録 + ダッシュボード')
  const { data: fe } = await admin.from('funnel_events').select('event_type').eq('partner_id',F.pId)
  const types=(fe??[]).map(x=>x.event_type)
  ok(types.includes('landing_view') && types.includes('register'), 'funnel記録: landing_view+register', JSON.stringify(types))
  const actx=await browser.newContext({viewport:{width:1440,height:900}}); await actx.addCookies(await cookie('cc-p1-admin-throwaway@mb-system.internal','mb-auth-console')); const ap=await actx.newPage()
  await ap.goto(`${BASE}/console/deals`,{waitUntil:'networkidle'}); await ap.waitForTimeout(2500)
  ok((await ap.evaluate(()=>document.body.innerText)).includes(CUST), 'コンソールボードに帰属案件が出現')
  await ap.goto(`${BASE}/console/growth`,{waitUntil:'networkidle'}); await ap.waitForTimeout(2000)
  const g=await ap.evaluate(()=>document.body.innerText)
  ok(g.includes('成長') && g.includes('登録（リンク経由）') && g.includes('P1SHARE'), 'ダッシュボード: ファネル＋パートナー別生産性に実数表示', g.slice(0,120).replace(/\n/g,' '))
  await ap.screenshot({path:'docs/reports/screens_integrity/p1_growth_dashboard.png',fullPage:true})
  await actx.close()
} catch(e){ fatal=e }
finally {
  try {
    if(F.dealId) await admin.from('deals').delete().eq('id',F.dealId)
    if(F.token) await admin.from('referral_links').delete().eq('token',F.token)
    if(F.pId){ await admin.from('funnel_events').delete().eq('partner_id',F.pId); await admin.from('partners').delete().eq('id',F.pId) }
    for(const uid of [F.pUid,F.aUid].filter(Boolean)){ await admin.from('profiles').delete().eq('id',uid); await admin.auth.admin.deleteUser(uid) }
    const c=await admin.from('deals').select('id',{count:'exact',head:true}); const tw=await admin.from('profiles').select('id',{count:'exact',head:true}).like('email','%throwaway%')
    console.log('teardown: deals=',c.count,' throwaway=',tw.count)
  } catch(e2){ console.log('teardown err:', e2?.message) }
  if(browser) await browser.close().catch(()=>{})
  if(fatal){ console.log('FATAL:',fatal?.message); console.log(fatal?.stack?.slice(0,500)) }
  console.log(`RESULT: ${pass} passed / ${fail} failed`)
}
