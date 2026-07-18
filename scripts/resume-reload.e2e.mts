/** デプロイ跨ぎ自動リロードの実測: /api/resume-warm のshaを偽装→復帰イベント→自動reloadを確認。残置ゼロ。 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'
const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()]}))
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}})
const PW='CcRr!2026xx', REF='cc-rr-ref@mb-system.internal'
let pass=0,fail=0; const ok=(c:boolean,n:string,d='')=>{c?(pass++,console.log('  ✓',n)):(fail++,console.log('  ✗',n,d))}
const c=await admin.auth.admin.createUser({email:REF,password:PW,email_confirm:true})
await admin.from('profiles').upsert({id:c.data!.user!.id,name:'CC-RR',role:'partner',email:REF,color:'#888'})
await admin.from('partners').insert({profile_id:c.data!.user!.id,code:'CCRR01',status:'active'})
const b=await chromium.launch(); const p=await (await b.newContext()).newPage()
await p.goto('http://localhost:4599/app',{waitUntil:'domcontentloaded'});await p.waitForTimeout(1500)
await p.locator('input[type="email"]').fill(REF);await p.locator('input[type="password"]').fill(PW)
await p.locator('button[type="submit"]').first().click();await p.waitForTimeout(2800)
// 1) 正常時: sha一致→リロードしない
let reloads=0; p.on('framenavigated',f=>{ if(f===p.mainFrame()) reloads++ })
reloads=0
await p.evaluate(`document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('focus'))`)
await p.waitForTimeout(1500)
ok(reloads===0,'sha一致時はリロードしない',String(reloads))
// 2) 偽sha→新規ページ（コンポーネント初期状態=スロットルなし）で復帰イベント→実コンポーネント経路の自動リロード
const p2 = await (await b.newContext()).newPage()
await p2.goto('http://localhost:4599/app',{waitUntil:'domcontentloaded'});await p2.waitForTimeout(1500)
await p2.locator('input[type="email"]').fill(REF);await p2.locator('input[type="password"]').fill(PW)
await p2.locator('button[type="submit"]').first().click();await p2.waitForTimeout(2800)
await p2.route('**/api/resume-warm', r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({sha:'deadbeef'})}))
const nav = p2.waitForNavigation({timeout:8000}).catch(()=>null)
await p2.evaluate(`document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('focus'))`)
const navRes = await nav
ok(!!navRes,'sha不一致→実コンポーネント経路で自動リロード発火')
await p2.close()
await b.close()
const { data: l } = await admin.auth.admin.listUsers()
const u=(l?.users||[]).find((x:any)=>x.email===REF)
if(u){const {data:pa}=await admin.from('partners').select('id').eq('profile_id',u.id).maybeSingle(); if(pa)await admin.from('partners').delete().eq('id',pa.id); await admin.from('profiles').delete().eq('id',u.id); await admin.auth.admin.deleteUser(u.id)}
console.log(`\n== resume-reload: pass=${pass} fail=${fail}`)
process.exit(fail?1:0)
