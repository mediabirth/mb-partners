/**
 * サクサク計測（A-1/A-2/A-3）: 3面の代表遷移を cold/warm で実測。
 * warm遷移 = リンククリック→(a)骨格表示（最初の視覚変化）→(b)操作可能（目印セレクタ可視）。
 * cold = 新規コンテキストの初回ロード（クライアントキャッシュなし）＋ルートJS転送量(gz)。
 * ボタンfeedback = pointerdown→スタイル変化をrAFで計測。
 */
import { readFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { chromium, type Page, type BrowserContext } from 'playwright'
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()]}))
const A=createClient(env.NEXT_PUBLIC_SUPABASE_URL!,env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}})
const anon=createClient(env.NEXT_PUBLIC_SUPABASE_URL!,env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{auth:{persistSession:false,autoRefreshToken:false}})
const BASE='http://localhost:4599'
const b=await chromium.launch()

async function cookieFor(email:string){
  const {data:link}=await A.auth.admin.generateLink({type:'magiclink',email})
  const {data:vs}=await anon.auth.verifyOtp({type:'email',token_hash:link!.properties!.hashed_token})
  return 'base64-'+Buffer.from(JSON.stringify({access_token:vs!.session!.access_token,refresh_token:vs!.session!.refresh_token,token_type:'bearer',expires_in:vs!.session!.expires_in,expires_at:vs!.session!.expires_at,user:vs!.session!.user}),'utf8').toString('base64url')
}
async function ctxWith(cookieName:string,val:string,vp={width:1366,height:900}):Promise<BrowserContext>{
  const ctx=await b.newContext({viewport:vp,serviceWorkers:'block'})
  await ctx.addCookies([{name:cookieName,value:val,url:BASE,httpOnly:false,secure:false,sameSite:'Lax' as const}])
  return ctx
}
// 遷移計測（MPA/SPA両対応・wall-clock）: click→(a)DCL=骨格proxy→(b)操作可能(sel可視)
async function measureNav(pg:Page,linkSel:string,readySel:string):Promise<{skeleton:number;operable:number}|null>{
  try{
    const link=pg.locator(linkSel).first()
    if(!(await link.count()))return null
    const t0=Date.now()
    await link.click()
    await pg.waitForLoadState('domcontentloaded').catch(()=>{})
    const sk=Date.now()-t0
    await pg.locator(readySel).first().waitFor({state:'visible',timeout:15000})
    return {skeleton:sk,operable:Date.now()-t0}
  }catch{return null}
}
// coldロード: goto→readySel可視＋JS転送量
async function measureCold(ctx:BrowserContext,path:string,readySel:string):Promise<{operable:number;jsKB:number}>{
  const pg=await ctx.newPage()
  const t0=Date.now()
  await pg.goto(BASE+path,{waitUntil:'domcontentloaded'})
  await pg.locator(readySel).first().waitFor({state:'visible',timeout:20000}).catch(()=>{})
  const op=Date.now()-t0
  await pg.waitForTimeout(600)
  const jsKB=await pg.evaluate(`Math.round(performance.getEntriesByType('resource').filter(r=>r.name.includes('/_next/')&&r.name.split('?')[0].endsWith('.js')).reduce((s,r)=>s+(r.transferSize||0),0)/1024)`) as number
  await pg.close()
  return {operable:op,jsKB}
}
// ボタンfeedback: 実マウスdown（:active発火）→computedStyle変化までのrAF計測
async function measureFeedback(pg:Page,sel:string):Promise<number|null>{
  try{
    const el=pg.locator(sel).first()
    if(!(await el.count()))return null
    const box=await el.boundingBox(); if(!box)return null
    await pg.evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(sel)})
      window.__fb={before:JSON.stringify([getComputedStyle(el).transform,getComputedStyle(el).opacity,getComputedStyle(el).filter,getComputedStyle(el).backgroundColor]),t0:0,ms:null}
      window.__fbTick=()=>{const now=JSON.stringify([getComputedStyle(el).transform,getComputedStyle(el).opacity,getComputedStyle(el).filter,getComputedStyle(el).backgroundColor])
        if(now!==window.__fb.before){window.__fb.ms=performance.now()-window.__fb.t0}else if(performance.now()-window.__fb.t0<400)requestAnimationFrame(window.__fbTick)}
    })()`)
    await pg.mouse.move(box.x+box.width/2,box.y+box.height/2)
    await pg.evaluate(`(()=>{window.__fb.t0=performance.now();requestAnimationFrame(window.__fbTick)})()`)
    await pg.mouse.down()
    await pg.waitForTimeout(450)
    await pg.mouse.up()
    return await pg.evaluate(`window.__fb.ms==null?null:Math.round(window.__fb.ms)`) as number|null
  }catch{return null}
}

const results:Record<string,unknown>={}
// ── コンソール（monitor-ops） ──
const pw='Cc'+randomBytes(12).toString('base64url')+'!9'
const {data:l}=await A.auth.admin.listUsers()
for(const em of ['cc-monitor-ops@mb-system.internal']){const u=(l?.users||[]).find((x:any)=>x.email===em);await A.auth.admin.updateUserById(u!.id,{password:pw})}
{
  const ctx=await b.newContext({viewport:{width:1366,height:900},serviceWorkers:'block'})
  const pg=await ctx.newPage()
  await pg.goto(BASE+'/console/login',{waitUntil:'domcontentloaded'});await pg.waitForTimeout(800)
  await pg.locator('input[type="email"]').fill('cc-monitor-ops@mb-system.internal');await pg.locator('input[type="password"]').fill(pw)
  await pg.locator('button[type="submit"]').first().click();await pg.waitForTimeout(3500)
  const NAV=[
    ['deals','a[href="/console/deals"]','text=案件ボード'],
    ['partners','a[href="/console/partners"]','text=累計成約'],
    ['services','a[href="/console/services"]','text=サービス追加'],
    ['payouts','a[href="/console/payouts"]','text=支払管理'],
    ['suppliers','a[href="/console/suppliers"]','text=サプライヤーに昇格'],
    ['charges','a[href="/console/supplier-charges"]','text=月次クローズ'],
    ['applications','a[href="/console/applications"]','text=パートナー応募'],
    ['growth','a[href="/console/growth"]','text=休眠'],
    ['inquiries','a[href="/console/inquiries"]','text=問い合わせ'],
    ['home','a[href="/console"]','text=お金の内訳'],
  ] as const
  const rows:Record<string,unknown>[]=[]
  for(const [name,link,ready] of NAV){
    const m=await measureNav(pg,link,ready)
    rows.push({name,...(m??{skeleton:-1,operable:-1})})
    await pg.waitForTimeout(300)
  }
  const fb=await measureFeedback(pg,'.ui-btn')
  results.console={warm:rows,feedback:fb}
  await ctx.close()
}
// cold: console home
{
  const c=await b.newContext({viewport:{width:1366,height:900},serviceWorkers:'block'})
  const pg0=await c.newPage()
  await pg0.goto(BASE+'/console/login',{waitUntil:'domcontentloaded'});await pg0.waitForTimeout(600)
  await pg0.locator('input[type="email"]').fill('cc-monitor-ops@mb-system.internal');await pg0.locator('input[type="password"]').fill(pw)
  await pg0.locator('button[type="submit"]').first().click();await pg0.waitForTimeout(3000);await pg0.close()
  ;(results.console as any).cold=await measureCold(c,'/console','text=お金の内訳')
  await c.close()
}
// ── APP（デモ佐々木=リファラル） ──
{
  const cv=await cookieFor('demo.sasaki.ren@mb-system.internal')
  const ctx=await ctxWith('mb-auth-app',cv,{width:390,height:800})
  const pg=await ctx.newPage()
  await pg.goto(BASE+'/app',{waitUntil:'domcontentloaded'});await pg.waitForTimeout(2500)
  const NAV=[
    ['cases','a[href="/app/cases"]','text=案件'],
    ['refer','a[href="/app/refer"]','text=紹介をはじめる'],
    ['rewards','a[href="/app/rewards"]','text=報酬'],
    ['inbox','a[href="/app/inbox"]','text=通知'],
    ['home','a[href="/app"]','text=確定残高'],
  ] as const
  const rows:Record<string,unknown>[]=[]
  for(const [name,link,ready] of NAV){const m=await measureNav(pg,link,ready);rows.push({name,...(m??{skeleton:-1,operable:-1})});await pg.waitForTimeout(300)}
  const fb=await measureFeedback(pg,'a[href="/app/refer"]')
  results.app={warm:rows,feedback:fb}
  await ctx.close()
  const c2=await ctxWith('mb-auth-app',cv,{width:390,height:800})
  ;(results.app as any).cold=await measureCold(c2,'/app','text=確定残高')
  await c2.close()
}
// ── サプライヤー・コンソール（ZZ6153） ──
{
  const cv=await cookieFor('test.kambara@gmail.com')
  const ctx=await ctxWith('mb-auth-app',cv)
  const pg=await ctx.newPage()
  await pg.goto(BASE+'/app',{waitUntil:'domcontentloaded'});await pg.waitForTimeout(3000)
  const NAV=[
    ['network','.sup-side a[href="/app/s/network"]','text=あなたの紹介者が今月生んだ売上'],
    ['products','.sup-side a[href="/app/s/products"]','text=紹介報酬（すぐ反映）'],
    ['deals','.sup-side a[href="/app/s/deals"]','text=受注額（税抜）'],
    ['money','.sup-side a[href="/app/s/money"]','text=お支払い（MB Partnersへ）'],
    ['settings','.sup-side a[href="/app/s/settings"]','text=会社情報'],
    ['home','.sup-side a[href="/app"]','text=お金の内訳'],
  ] as const
  const rows:Record<string,unknown>[]=[]
  for(const [name,link,ready] of NAV){const m=await measureNav(pg,link,ready);rows.push({name,...(m??{skeleton:-1,operable:-1})});await pg.waitForTimeout(300)}
  const fb=await measureFeedback(pg,'.sup-side a[href="/app/s/network"]')
  results.supplier={warm:rows,feedback:fb}
  await ctx.close()
  const c2=await ctxWith('mb-auth-app',cv)
  ;(results.supplier as any).cold=await measureCold(c2,'/app','text=お金の内訳')
  await c2.close()
}
await b.close()
console.log(JSON.stringify(results,null,1))
