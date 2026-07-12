import { readFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()]}))
const a=createClient(env.NEXT_PUBLIC_SUPABASE_URL!,env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}})
const anon=createClient(env.NEXT_PUBLIC_SUPABASE_URL!,env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{auth:{persistSession:false,autoRefreshToken:false}})
const BASE='https://mb-partners.app', SHA=process.argv[2]??''
let pass=0,fail=0; const ok=(c:boolean,n:string,d='')=>{c?(pass++,console.log(' ✓',n)):(fail++,console.log(' ✗',n,d))}
const b=await chromium.launch()
// [1] stamp + 非サプライヤーredirect（cc-monitor・一時パスワード）
const pw='Cc'+randomBytes(12).toString('base64url')+'!9'
const {data:l}=await a.auth.admin.listUsers()
const mon=(l?.users||[]).find((x:any)=>x.email==='cc-monitor@mb-system.internal')
await a.auth.admin.updateUserById(mon!.id,{password:pw})
{
  const ctx=await b.newContext({viewport:{width:1024,height:768}}); const pg=await ctx.newPage()
  await pg.goto(BASE+'/app/login',{waitUntil:'domcontentloaded'});await pg.waitForTimeout(1500)
  await pg.locator('input[type="email"]').fill('cc-monitor@mb-system.internal');await pg.locator('input[type="password"]').fill(pw)
  await pg.locator('button[type="submit"]').first().click();await pg.waitForTimeout(3500)
  await pg.goto(BASE+'/app/settings',{waitUntil:'domcontentloaded'});await pg.waitForTimeout(2200)
  ok(((await pg.evaluate(`document.body.innerText`)) as string).includes(SHA.slice(0,7)),'stamp=HEAD一致('+SHA.slice(0,7)+')')
  await pg.goto(BASE+'/app/supplier',{waitUntil:'domcontentloaded'});await pg.waitForTimeout(2500)
  ok(!pg.url().includes('/app/supplier'),'本番: 非サプライヤー直打ち→リダイレクト',pg.url())
  await ctx.close()
}
// [2] ZZ6153（オムニス）read-only: magiclinkのtoken_hashをverifyOtp→mb-auth-appクッキー注入（パスワード非接触）
const {data:zz}=await a.from('partners').select('id, profile_id').eq('code','ZZ6153').maybeSingle()
const {data:zzProf}=await a.from('profiles').select('email').eq('id',zz!.profile_id).maybeSingle()
const {data:link}=await a.auth.admin.generateLink({type:'magiclink',email:zzProf!.email!})
const {data:vs,error:ve}=await anon.auth.verifyOtp({type:'email',token_hash:link!.properties!.hashed_token})
if(ve||!vs?.session){console.log('verifyOtp失敗:',ve?.message);process.exit(1)}
const sess={access_token:vs.session.access_token,refresh_token:vs.session.refresh_token,token_type:'bearer',expires_in:vs.session.expires_in,expires_at:vs.session.expires_at,user:vs.session.user}
const cookieVal='base64-'+Buffer.from(JSON.stringify(sess),'utf8').toString('base64url')
for(const vp of [{width:375,height:667},{width:1024,height:768}]){
  const ctx=await b.newContext({viewport:vp})
  await ctx.addCookies([{name:'mb-auth-app',value:cookieVal,url:BASE,httpOnly:false,secure:true,sameSite:'Lax' as const}])
  const pg=await ctx.newPage(); const errs:string[]=[]; pg.on('pageerror',e=>errs.push(e.message))
  await pg.goto(BASE+'/app/supplier',{waitUntil:'domcontentloaded'});await pg.waitForTimeout(3000)
  const t=await pg.evaluate(`document.body.innerText`) as string
  const tag='['+vp.width+']'
  ok(pg.url().includes('/app/supplier'),tag+' ZZ6153: ポータル到達（自社データ本人表示）',pg.url())
  if(vp.width===375){
    ok(t.includes('自社メニューの今月の成約'),tag+' ヒーロー表示')
    ok(t.includes('オムニス'),tag+' 供給ブランド「オムニス」表示')
    ok(t.includes('ファウンディング（月額）'),tag+' 適用プラン=ファウンディング')
    ok(t.includes('月額（プラン基本料）')||t.includes('今月分の対象はまだありません')||t.includes('50,000'),tag+' 見込み欄が正しく描画')
    ok(!t.includes('CC-E2E')&&!t.includes('供給 検証'),tag+' 検証残骸・他社データゼロ')
    ok(!t.includes('unbilled')&&!t.includes('invoiced'),tag+' 内部語彙ゼロ')
  }
  ok((await pg.evaluate(`document.documentElement.scrollWidth`) as number)<=vp.width,tag+' 横はみ出しなし')
  ok(errs.length===0,tag+' pageerrors=[]',JSON.stringify(errs))
  if(vp.width===375){
    await pg.goto(BASE+'/app/mypage',{waitUntil:'domcontentloaded'});await pg.waitForTimeout(2200)
    ok(((await pg.evaluate(`document.body.innerText`)) as string).includes('サプライヤー ポータル'),tag+' mypage: 導線カード表示')
  }
  await ctx.close()
}
await b.close()
console.log('PROD3:',pass+'/'+(pass+fail))
process.exit(fail>0?1:0)
