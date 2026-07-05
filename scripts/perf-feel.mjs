// 体感速度の実機相当計測（CPU 4x スロットル＋4G）。ルート遷移・コールドスタート・戻る復帰。
// PERF_LABEL=baseline|after で before/after 比較。throwaway 認証で app/vendor/console を計測。
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { chromium } from 'playwright'
const env = Object.fromEntries(readFileSync(new URL('../.env.local', import.meta.url),'utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim()]}))
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} })
const APP = process.env.BASE_APP || 'https://mb-partners.app'
const CONSOLE = process.env.BASE_CONSOLE || 'https://console.mb-partners.app'
const LABEL = process.env.PERF_LABEL || 'baseline'
const PW='PerfMeas!2026'
const AS = {
  app:    { email:'cc-perf-partner-throwaway@mb-system.internal', name:'計測P', cookie:'mb-auth-app', domain:'mb-partners.app', base:APP, home:'/app' },
  vendor: { email:'cc-perf-vendor-throwaway@mb-system.internal',  name:'計測V', cookie:'mb-auth-vendor', domain:'mb-partners.app', base:APP, home:'/vendor' },
  console:{ email:'cc-perf-admin-throwaway@mb-system.internal',   name:'計測A', cookie:'mb-auth-console', domain:'console.mb-partners.app', base:CONSOLE, home:'/console' },
}
async function cookie(email,name,domain){ const {data:link}=await admin.auth.admin.generateLink({type:'magiclink',email}); const tmp=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{auth:{persistSession:false}}); const {data:vfy}=await tmp.auth.verifyOtp({type:'magiclink',token_hash:link.properties.hashed_token}); const jar={}; const ssr=createServerClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{cookieOptions:{name},cookies:{getAll:()=>Object.entries(jar).map(([n,v])=>({name:n,value:v})),setAll:(a)=>a.forEach(({name:n,value:v})=>{jar[n]=v})}}); await ssr.auth.setSession({access_token:vfy.session.access_token,refresh_token:vfy.session.refresh_token}); return Object.entries(jar).map(([n,v])=>({name:n,value:v,domain,path:'/',secure:true,sameSite:'Lax'})) }
async function throttle(page){ const cdp=await page.context().newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate',{rate:4}); await cdp.send('Network.enable'); await cdp.send('Network.emulateNetworkConditions',{offline:false, downloadThroughput:4*1024*1024/8, uploadThroughput:3*1024*1024/8, latency:80}); return cdp }
const med = arr => { const s=arr.filter(x=>x!=null).sort((a,b)=>a-b); return s.length? Math.round(s[Math.floor(s.length/2)]) : null }

// ルート遷移: home で目的navをクリック→URLが目的pathに変わり、目的の見出しテキストが出るまで（load・networkidle回避）。
async function measureNav(page, base, targetPath, targetText, runs=3){
  const times=[]
  for(let i=0;i<runs;i++){
    await page.goto(base, {waitUntil:'load'}).catch(()=>{})
    const el = page.locator(`a[href="${targetPath}"]`).first()
    // ハイドレーション完了（クリック可能）まで待ってから計測開始＝SPA遷移そのものを測る。
    await el.waitFor({ state:'visible', timeout:20000 }).catch(()=>{})
    if(!(await el.count())) return null
    await page.waitForTimeout(400)
    const t0=Date.now()
    await el.click().catch(()=>{})
    await page.waitForURL(u=>new URL(u).pathname===targetPath, {timeout:12000}).catch(()=>{})
    await page.waitForFunction(txt=>document.body && document.body.innerText.includes(txt), targetText, {timeout:12000}).catch(()=>{})
    times.push(Date.now()-t0)
    await page.waitForTimeout(200)
  }
  return med(times)
}
async function measureCold(browser, surf, targetText, runs=2){
  const times=[]
  for(let i=0;i<runs;i++){
    const ctx=await browser.newContext({viewport:{width:390,height:844}})
    await ctx.addCookies(await cookie(surf.email, surf.cookie, surf.domain))
    const p=await ctx.newPage(); await throttle(p)
    const t0=Date.now()
    await p.goto(surf.base+surf.home,{waitUntil:'load'}).catch(()=>{})
    await p.waitForFunction(txt=>document.body && document.body.innerText.includes(txt), targetText, {timeout:20000}).catch(()=>{})
    times.push(Date.now()-t0)
    await ctx.close()
  }
  return med(times)
}

async function main(){
  for(const k of Object.keys(AS)){ const a=AS[k]; const {data:list}=await admin.auth.admin.listUsers(); let u=(list?.users||[]).find(x=>x.email===a.email); if(!u){ const c=await admin.auth.admin.createUser({email:a.email,password:PW,email_confirm:true,app_metadata:{role:k==='console'?'owner':k}}); u=c.data.user; await admin.from('profiles').upsert({id:u.id,name:a.name,role:k==='console'?'owner':k,email:a.email,color:'#888'}); if(k==='vendor') await admin.from('deliveries').insert({name:'計測委託先（throwaway）',kind:'撮影',active:true,service_id:'reso',auth_user_id:u.id,display_code:'PM9999'}).then(()=>{},()=>{}) } }
  const browser=await chromium.launch()
  const R={ app:{}, vendor:{}, console:{} }
  for(const [k,surf] of Object.entries(AS)){
    const ctx=await browser.newContext({viewport:{width:390,height:844}}); await ctx.addCookies(await cookie(surf.email,surf.cookie,surf.domain)); const p=await ctx.newPage(); await throttle(p)
    if(k==='app'){
      R.app.nav_cases = await measureNav(p, APP+'/app', '/app/cases', '案件')
      R.app.nav_rewards = await measureNav(p, APP+'/app', '/app/rewards', '報酬')
      R.app.nav_mypage = await measureNav(p, APP+'/app', '/app/mypage', 'マイページ')
    } else if(k==='vendor'){
      R.vendor.nav_cases = await measureNav(p, APP+'/vendor', '/vendor/cases', '担当案件')
      R.vendor.nav_rewards = await measureNav(p, APP+'/vendor', '/vendor/rewards', '委託費の明細')
      R.vendor.nav_inbox = await measureNav(p, APP+'/vendor', '/vendor/inbox', '通知')
    } else {
      R.console.nav_services = await measureNav(p, CONSOLE+'/console', '/console/services', 'サービスマスタ')
      R.console.nav_partners = await measureNav(p, CONSOLE+'/console', '/console/partners', 'パートナー')
    }
    // 戻る復帰: home を確実に履歴に積んでから subpage→goBack→home 復帰時間を測る。
    const homeMark = k==='console'?'ボード':k==='vendor'?'委託費見込み':'ホーム'
    await p.goto(surf.base+surf.home,{waitUntil:'load'}).catch(()=>{}); await p.waitForTimeout(1500)
    await p.goto(surf.base+(k==='console'?'/console/services':k==='vendor'?'/vendor/cases':'/app/cases'),{waitUntil:'load'}).catch(()=>{}); await p.waitForTimeout(1000)
    const t0=Date.now(); await p.goBack({waitUntil:'commit'}).catch(()=>{}); await p.waitForFunction(txt=>document.body&&document.body.innerText.includes(txt), homeMark, {timeout:10000}).catch(()=>{}); R[k].back = Date.now()-t0
    await ctx.close()
  }
  R.app.cold = await measureCold(browser, AS.app, 'ホーム')
  R.vendor.cold = await measureCold(browser, AS.vendor, '委託費見込み')
  R.console.cold = await measureCold(browser, AS.console, 'ボード')
  await browser.close()
  console.log('\n===== PERF ['+LABEL+'] （CPU4x + 4G・中央値ms）=====')
  for(const k of Object.keys(R)){ console.log(k+':', JSON.stringify(R[k])) }
  console.log('=====================================\n')
  if(process.env.PERF_TEARDOWN==='1'){ const {data:list}=await admin.auth.admin.listUsers(); for(const k of Object.keys(AS)){ const u=(list?.users||[]).find(x=>x.email===AS[k].email); if(!u)continue; await admin.from('deliveries').delete().eq('auth_user_id',u.id).then(()=>{},()=>{}); await admin.from('profiles').delete().eq('id',u.id); await admin.auth.admin.deleteUser(u.id) } console.log('teardown done') }
}
main().catch(e=>{ console.log('FATAL', e?.message); process.exit(1) })
