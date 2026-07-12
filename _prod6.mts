import { readFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()]}))
const a=createClient(env.NEXT_PUBLIC_SUPABASE_URL!,env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}})
const BASE='https://mb-partners.app', SHA=process.argv[2]??''
let pass=0,fail=0; const ok=(c:boolean,n:string,d='')=>{c?(pass++,console.log(' ✓',n)):(fail++,console.log(' ✗',n,d))}
const pw='Cc'+randomBytes(12).toString('base64url')+'!9'
const {data:l}=await a.auth.admin.listUsers()
for(const em of ['cc-monitor@mb-system.internal','cc-monitor-ops@mb-system.internal']){const u=(l?.users||[]).find((x:any)=>x.email===em);await a.auth.admin.updateUserById(u!.id,{password:pw})}
const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:1366,height:900}})
const ap=await ctx.newPage()
await ap.goto(BASE+'/app/login',{waitUntil:'domcontentloaded'});await ap.waitForTimeout(1500)
await ap.locator('input[type="email"]').fill('cc-monitor@mb-system.internal');await ap.locator('input[type="password"]').fill(pw)
await ap.locator('button[type="submit"]').first().click();await ap.waitForTimeout(3500)
await ap.goto(BASE+'/app/settings',{waitUntil:'domcontentloaded'});await ap.waitForTimeout(2200)
ok(((await ap.evaluate(`document.body.innerText`)) as string).includes(SHA.slice(0,7)),'stamp=HEAD一致('+SHA.slice(0,7)+')')
const cp=await ctx.newPage()
await cp.goto(BASE+'/console/login',{waitUntil:'domcontentloaded'});await cp.waitForTimeout(1500)
await cp.locator('input[type="email"]').fill('cc-monitor-ops@mb-system.internal');await cp.locator('input[type="password"]').fill(pw)
await cp.locator('button[type="submit"]').first().click();await cp.waitForTimeout(3500)
await cp.goto(BASE+'/console',{waitUntil:'domcontentloaded'});await cp.waitForTimeout(4500)
const dash=await cp.evaluate(`document.body.innerText`) as string
ok(dash.includes('最近の動き')&&!dash.includes('直販'),'本番: ダッシュボード浄化（直販語ゼロ・最近の動き健在）')
await cp.goto(BASE+'/console/partners/invite?kind=supplier',{waitUntil:'domcontentloaded'});await cp.waitForTimeout(2500)
const inv=await cp.evaluate(`document.body.innerText`) as string
ok(inv.includes('サプライヤー（会社）')&&inv.includes('適用レートカード')&&inv.includes('会社名'),'本番: 招待にサプライヤー種別＋カード選択')
await cp.goto(BASE+'/console/payouts',{waitUntil:'domcontentloaded'});await cp.waitForTimeout(4000)
const po=await cp.evaluate(`document.body.innerText`) as string
ok((po.includes('2026-05')||po.includes('5月'))&&(po.includes('2026-04')||po.includes('4月')),'本番: 支払管理にデモ混在バッチ')
await cp.goto(BASE+'/console/applications',{waitUntil:'domcontentloaded'});await cp.waitForTimeout(2500)
ok(((await cp.evaluate(`document.body.innerText`)) as string).includes('出品の相談'),'本番: 応募（出品の相談バッジ）')
await b.close(); console.log('PROD6:',pass+'/'+(pass+fail)); process.exit(fail>0?1:0)
