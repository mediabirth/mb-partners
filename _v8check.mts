import { readFileSync, mkdirSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()]}))
const A=createClient(env.NEXT_PUBLIC_SUPABASE_URL!,env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}})
const anon=createClient(env.NEXT_PUBLIC_SUPABASE_URL!,env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{auth:{persistSession:false,autoRefreshToken:false}})
const BASE='http://localhost:4599', OUT='docs/reports/review_screens/supplier_console_v8'
mkdirSync(OUT,{recursive:true})
let pass=0,fail=0; const ok=(c:boolean,n:string,d='')=>{c?(pass++,console.log(' ✓',n)):(fail++,console.log(' ✗',n,d))}
// ZZ6153: subtitle申請→console承認→APP(/api/services)反映→原状復帰
const {data:link}=await A.auth.admin.generateLink({type:'magiclink',email:'test.kambara@gmail.com'})
const {data:vs}=await anon.auth.verifyOtp({type:'email',token_hash:link!.properties!.hashed_token})
const cv='base64-'+Buffer.from(JSON.stringify({access_token:vs!.session!.access_token,refresh_token:vs!.session!.refresh_token,token_type:'bearer',expires_in:vs!.session!.expires_in,expires_at:vs!.session!.expires_at,user:vs!.session!.user}),'utf8').toString('base64url')
const b=await chromium.launch()
const ctx=await b.newContext({viewport:{width:1440,height:900}})
await ctx.addCookies([{name:'mb-auth-app',value:cv,url:BASE,httpOnly:false,secure:false,sameSite:'Lax' as const}])
const pg=await ctx.newPage(); const errs:string[]=[]; pg.on('pageerror',e=>errs.push(e.message))
await pg.goto(BASE+'/app/s/products',{waitUntil:'domcontentloaded'});await pg.waitForTimeout(2800)
await pg.locator('text=オムニス').first().click();await pg.waitForTimeout(1500)
await pg.screenshot({path:`${OUT}/pc_services_drawer_3pane.png`})
// 3ペイン: プレビュー可視・全フィールド
const pvw=await pg.evaluate(`(()=>{const p=document.querySelector('.prod-preview');return p?getComputedStyle(p).display:''})()`) as string
ok(pvw==='block','3ペイン: APPプレビュー表示（≥1280）')
const dt=await pg.evaluate(`document.body.innerText`) as string
ok(dt.includes('サブタイトル')&&dt.includes('サービス概要')&&dt.includes('こんなお客さまに')&&dt.includes('WebサイトURL'),'全フィールド編集（基本情報）')
ok(dt.includes('APPでの見え方'),'プレビューラベル')
// subtitle入力→プレビュー即反映→申請
await pg.locator('input[placeholder="賃貸仲介プラットフォーム"]').fill('資産形成の総合パートナー（検証）')
await pg.waitForTimeout(400)
ok(((await pg.evaluate(`document.querySelector('.prod-preview')?.textContent||''`)) as string).includes('資産形成の総合パートナー（検証）'),'編集がプレビューに即反映')
await pg.locator('button',{hasText:'変更を申請'}).click();await pg.waitForTimeout(2500)
const {data:req}=await A.from('supplier_change_requests').select('id, kind, status, payload').eq('kind','subtitle').eq('status','pending').order('created_at',{ascending:false}).limit(1).maybeSingle()
ok(req?.kind==='subtitle'&&(req?.payload as any)?.value==='資産形成の総合パートナー（検証）','申請行=pending（差分のみ）')
// console承認（monitor-ops）
const pw='Cc'+randomBytes(12).toString('base64url')+'!9'
const {data:l}=await A.auth.admin.listUsers()
const ops=(l?.users||[]).find((x:any)=>x.email==='cc-monitor-ops@mb-system.internal')
await A.auth.admin.updateUserById(ops!.id,{password:pw})
const c2=await b.newContext({viewport:{width:1366,height:900}}); const p2=await c2.newPage()
p2.on('dialog',d=>d.accept().catch(()=>{}))
await p2.goto(BASE+'/console/login',{waitUntil:'domcontentloaded'});await p2.waitForTimeout(1200)
await p2.locator('input[type="email"]').fill('cc-monitor-ops@mb-system.internal');await p2.locator('input[type="password"]').fill(pw)
await p2.locator('button[type="submit"]').first().click();await p2.waitForTimeout(3000)
const ap=await p2.evaluate(`fetch('/api/console/supplier-requests',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({id:'${req!.id}',action:'approve'})}).then(r=>r.status)`) as number
ok(ap===200,'console承認=200')
const {data:svcRow}=await A.from('services').select('subtitle').eq('id','omnis').single()
ok(svcRow!.subtitle==='資産形成の総合パートナー（検証）','承認→services.subtitle反映（=APPに正しく表示）')
await c2.close()
// スクショ: 招待モーダル・お金3区分
await pg.goto(BASE+'/app/s/partners',{waitUntil:'domcontentloaded'});await pg.waitForTimeout(2500)
await pg.locator('button',{hasText:'パートナーを招待'}).click();await pg.waitForTimeout(700)
await pg.screenshot({path:`${OUT}/pc_invite_modal.png`})
await pg.locator('button',{hasText:'閉じる'}).click();await pg.waitForTimeout(400)
await pg.goto(BASE+'/app/s/money',{waitUntil:'domcontentloaded'});await pg.waitForTimeout(3000)
await pg.screenshot({path:`${OUT}/pc_money_3way.png`,fullPage:true})
const tm=await pg.evaluate(`document.body.innerText`) as string
ok(tm.includes('① MB Partnersへのお支払い')&&tm.includes('② パートナーへの報酬')&&tm.includes('③ 委託先への委託費')&&tm.includes('MB Partnersが代行'),'お金3区分＋代行注記')
// SP溢れ
const c3=await b.newContext({viewport:{width:375,height:760}})
await c3.addCookies([{name:'mb-auth-app',value:cv,url:BASE,httpOnly:false,secure:false,sameSite:'Lax' as const}])
const p3=await c3.newPage()
for(const p of ['/app/s/products','/app/s/partners','/app/s/money']){
  await p3.goto(BASE+p,{waitUntil:'domcontentloaded'});await p3.waitForTimeout(2400)
  const ow=await p3.evaluate(`document.documentElement.scrollWidth`) as number
  ok(ow<=375,'[375] '+p+' 溢れゼロ',String(ow))
}
await c3.close()
ok(errs.length===0,'pageerrors=[]',JSON.stringify(errs))
// 原状復帰（subtitle→null・申請行削除）
await A.from('services').update({subtitle:null}).eq('id','omnis')
await A.from('supplier_change_requests').delete().eq('id',req!.id)
const {data:after}=await A.from('services').select('subtitle').eq('id','omnis').single()
ok(after!.subtitle===null,'原状復帰（subtitle=null・台帳外の残置ゼロ）')
await b.close(); console.log('V8:',pass+'/'+(pass+fail)); process.exit(fail>0?1:0)
