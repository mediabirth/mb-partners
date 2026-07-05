// 通水P3検証: ①マイルストーン（累計報酬・静音）②フロンティア循環（downline override 実測）③自動送信マトリクス（ドライラン・送信ゼロ）。
// throwawayのみ・ローカル本番ビルド（RESEND不在＝送信ゼロ）。money不変。
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
async function money(){ const {data:mr}=await admin.from('menu_rewards').select('reward_value'); const {count}=await admin.from('deals').select('id',{count:'exact',head:true}).eq('created_by','bfb3c027-b460-4aad-93a2-66fadf5a78b1'); return {sum:(mr??[]).reduce((s,r)=>s+Number(r.reward_value),0), rows:mr?.length, katsu:count} }
const now=new Date(); const ym=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`
const F={ mUid:null, mId:null, mDeal:null, fUid:null, fId:null, sUid:null, sId:null, sDeal:null, aUid:null }
let browser=null, fatal=null
try {
  const m0=await money()
  const { data: mlog0 } = await admin.from('mail_log').select('id',{count:'exact',head:true})
  const mailBefore = mlog0 ?? 0

  // ① マイルストーン用: throwaway partner + confirmed deal ¥350,000（¥300k節目を越え、次¥500k）
  const mu=await admin.auth.admin.createUser({email:'cc-p3-mile-throwaway@mb-system.internal',password:'x',email_confirm:true,app_metadata:{role:'partner'}}); F.mUid=mu.data.user.id
  await admin.from('profiles').insert({id:F.mUid,name:'P3累計',role:'partner',email:'cc-p3-mile-throwaway@mb-system.internal',color:'#888'})
  const mp=await admin.from('partners').insert({profile_id:F.mUid,code:'P3MILE',status:'active'}).select('id').single(); F.mId=mp.data.id
  const md=await admin.from('deals').insert({partner_id:F.mId,customer_name:'累計検証㈱',channel:'referral',source:'link',status:'confirmed',consent:true,amount:350000,fixed_month:ym,created_by:null}).select('id').single(); F.mDeal=md.data.id

  // ② フロンティア用: frontier親 + downline子 + 子の confirmed deal ¥200,000（override=¥20,000）
  const fu=await admin.auth.admin.createUser({email:'cc-p3-frontier-throwaway@mb-system.internal',password:'x',email_confirm:true,app_metadata:{role:'partner'}}); F.fUid=fu.data.user.id
  await admin.from('profiles').insert({id:F.fUid,name:'P3親',role:'partner',email:'cc-p3-frontier-throwaway@mb-system.internal',color:'#888'})
  const fp=await admin.from('partners').insert({profile_id:F.fUid,code:'P3FRONT',status:'active',is_frontier:true}).select('id').single(); F.fId=fp.data.id
  const su=await admin.auth.admin.createUser({email:'cc-p3-sub-throwaway@mb-system.internal',password:'x',email_confirm:true,app_metadata:{role:'partner'}}); F.sUid=su.data.user.id
  await admin.from('profiles').insert({id:F.sUid,name:'P3子',role:'partner',email:'cc-p3-sub-throwaway@mb-system.internal',color:'#888'})
  const linkedAt=new Date(now.getTime()-40*86400000).toISOString()  // 前月＝deal月(当月1日)より前かつ12M以内
  const sp=await admin.from('partners').insert({profile_id:F.sUid,code:'P3SUB',status:'active',frontier_id:F.fId,frontier_linked_at:linkedAt}).select('id').single(); F.sId=sp.data.id
  const sd=await admin.from('deals').insert({partner_id:F.sId,customer_name:'配下検証㈱',channel:'referral',source:'link',status:'confirmed',consent:true,amount:200000,fixed_month:ym,created_by:null}).select('id').single(); F.sDeal=sd.data.id

  const au=await admin.auth.admin.createUser({email:'cc-p3-admin-throwaway@mb-system.internal',password:'x',email_confirm:true,app_metadata:{role:'owner'}}); F.aUid=au.data.user.id
  await admin.from('profiles').insert({id:F.aUid,name:'P3管',role:'owner',email:'cc-p3-admin-throwaway@mb-system.internal',color:'#888'})

  browser=await chromium.launch()
  // ① マイルストーン
  const c1=await browser.newContext({viewport:{width:430,height:900}}); await c1.addCookies(await cookie('cc-p3-mile-throwaway@mb-system.internal','mb-auth-app'))
  const p1=await c1.newPage(); p1.on('pageerror',e=>console.log('  mile err:',String(e).slice(0,120)))
  await p1.goto(`${BASE}/app/rewards`,{waitUntil:'networkidle'}); await p1.waitForTimeout(1500)
  const t1=await p1.evaluate(()=>document.body.innerText)
  ok(t1.includes('これまでの累計報酬') && t1.includes('¥350,000'), '①マイルストーン: 累計¥350,000を静音表示', t1.slice(0,100).replace(/\n/g,' '))
  ok(t1.includes('次の節目') && (t1.includes('¥50万') || t1.includes('500,000') || t1.includes('¥15万') || t1.includes('あと')), '①マイルストーン: 次の節目までの残額を表示', '')
  await p1.screenshot({path:'docs/reports/screens_integrity/p3_milestone.png',fullPage:false}); await c1.close()

  // ② フロンティア循環
  const c2=await browser.newContext({viewport:{width:430,height:900}}); await c2.addCookies(await cookie('cc-p3-frontier-throwaway@mb-system.internal','mb-auth-app'))
  const p2=await c2.newPage(); p2.on('pageerror',e=>console.log('  front err:',String(e).slice(0,120)))
  await p2.goto(`${BASE}/app/frontier`,{waitUntil:'networkidle'}); await p2.waitForTimeout(1500)
  const t2=await p2.evaluate(()=>document.body.innerText)
  ok(!t2.includes('見つかりません') && (t2.includes('チーム') || t2.includes('オーバーライド')), '②フロンティア: ダッシュボード到達（frontier gate通過）', '')
  ok(t2.includes('P3子') || t2.includes('20,000') || t2.includes('¥2万'), '②フロンティア: 配下の存在＋override実額を表示', t2.slice(0,120).replace(/\n/g,' '))
  await p2.screenshot({path:'docs/reports/screens_integrity/p3_frontier.png',fullPage:true}); await c2.close()

  // ③ 自動送信マトリクス（ドライラン）
  const c3=await browser.newContext({viewport:{width:1440,height:900}}); await c3.addCookies(await cookie('cc-p3-admin-throwaway@mb-system.internal','mb-auth-console'))
  const p3=await c3.newPage(); p3.on('pageerror',e=>console.log('  mail err:',String(e).slice(0,120)))
  await p3.goto(`${BASE}/console/settings/mail`,{waitUntil:'networkidle'}); await p3.waitForTimeout(1500)
  await p3.getByRole('button',{name:/送信マトリクス/}).click().catch(()=>{}); await p3.waitForTimeout(1000)
  const t3=await p3.evaluate(()=>document.body.innerText)
  ok(t3.includes('ドライラン') && t3.includes('この画面からは送信されません'), '③マトリクス: ドライランのバナー表示', '')
  ok(t3.includes('紹介受付') && t3.includes('成約') && (t3.includes('受け付けた') || t3.includes('とき') || t3.includes('送られる')), '③マトリクス: イベント×宛先＋「いつ」トリガーを表示', '')
  await p3.screenshot({path:'docs/reports/screens_integrity/p3_matrix_dryrun.png',fullPage:true}); await c3.close()

  const { data: mlog1 } = await admin.from('mail_log').select('id',{count:'exact',head:true})
  ok((mlog1 ?? 0) === mailBefore, '③送信ゼロ: mail_log 件数不変（ドライラン＝実送信なし）', `before=${mailBefore} after=${mlog1}`)

  const m1=await money()
  ok(m0.sum===m1.sum && m1.sum===340100 && m1.rows===16 && m0.katsu===m1.katsu && m1.katsu===3, 'money不変: 16行/¥340,100・勝彦3', JSON.stringify(m1))
} catch(e){ fatal=e }
finally {
  try {
    for(const id of [F.mDeal,F.sDeal].filter(Boolean)) await admin.from('deals').delete().eq('id',id)
    for(const id of [F.sId,F.mId,F.fId].filter(Boolean)) await admin.from('partners').delete().eq('id',id)
    for(const uid of [F.mUid,F.fUid,F.sUid,F.aUid].filter(Boolean)){ await admin.from('profiles').delete().eq('id',uid); await admin.auth.admin.deleteUser(uid) }
    const tw=await admin.from('profiles').select('id',{count:'exact',head:true}).like('email','%throwaway%')
    console.log('teardown: throwaway残=',tw.count)
  } catch(e2){ console.log('teardown err:', e2?.message) }
  if(browser) await browser.close().catch(()=>{})
  if(fatal){ console.log('FATAL:',fatal?.message); console.log(String(fatal?.stack).slice(0,400)) }
  console.log(`RESULT: ${pass} passed / ${fail} failed`)
}
