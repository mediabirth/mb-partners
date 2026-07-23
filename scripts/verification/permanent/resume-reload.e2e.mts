/** デプロイ跨ぎ自動リロードの恒久実測。throwawayのみ・成否にかかわらず撤去。 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { launchChromium } from '../playwright-launch.mjs'
const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()]}))
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}})
const BASE=process.env.BASE_APP||'http://localhost:4599', PW='CcRr!2026xx', REF='cc-rr-ref@mb-system.internal'
let pass=0,fail=0
const ok=(c:boolean,n:string,d='')=>{c?(pass++,console.log('  ✓',n)):(fail++,console.log('  ✗',n,d))}
async function cleanup(){
  const {data:l}=await admin.auth.admin.listUsers()
  const u=(l?.users||[]).find((x:any)=>x.email===REF)
  if(!u)return
  const {data:pa}=await admin.from('partners').select('id').eq('profile_id',u.id).maybeSingle()
  if(pa)await admin.from('partners').delete().eq('id',pa.id)
  await admin.from('profiles').delete().eq('id',u.id)
  await admin.auth.admin.deleteUser(u.id)
}
await cleanup()
const c=await admin.auth.admin.createUser({email:REF,password:PW,email_confirm:true})
await admin.from('profiles').upsert({id:c.data!.user!.id,name:'CC-RR',role:'partner',email:REF,color:'#888'})
await admin.from('partners').insert({profile_id:c.data!.user!.id,code:'CCRR01',status:'active'})
let b
try{
  b=await launchChromium()
  const context=await b.newContext()
  const p=await context.newPage()
  await p.goto(BASE+'/app',{waitUntil:'domcontentloaded'});await p.waitForTimeout(1500)
  await p.locator('input[type="email"]').fill(REF);await p.locator('input[type="password"]').fill(PW)
  await p.locator('button[type="submit"]').first().click();await p.waitForTimeout(2800)
  let reloads=0;p.on('framenavigated',f=>{if(f===p.mainFrame())reloads++});reloads=0
  await p.evaluate(`document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('focus'))`)
  await p.waitForTimeout(1500)
  ok(reloads===0,'sha一致時はリロードしない',String(reloads))
  await context.clearCookies()
  const p2=await context.newPage()
  await p2.goto(BASE+'/app',{waitUntil:'domcontentloaded'});await p2.waitForTimeout(1500)
  await p2.locator('input[type="email"]').fill(REF);await p2.locator('input[type="password"]').fill(PW)
  await p2.locator('button[type="submit"]').first().click();await p2.waitForTimeout(2800)
  await p2.route('**/api/resume-warm',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({sha:'deadbeef'})}))
  const nav=p2.waitForNavigation({timeout:8000}).catch(()=>null)
  await p2.evaluate(`document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('focus'))`)
  ok(!!(await nav),'sha不一致→実コンポーネント経路で自動リロード発火')
}finally{
  await b?.close().catch(()=>{})
  await cleanup()
}
console.log(`\nRESUME-RELOAD: ${pass} passed / ${fail} failed`)
process.exit(fail?1:0)
