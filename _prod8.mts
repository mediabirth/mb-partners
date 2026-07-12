import { readFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()]}))
const a=createClient(env.NEXT_PUBLIC_SUPABASE_URL!,env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}})
const anon=createClient(env.NEXT_PUBLIC_SUPABASE_URL!,env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{auth:{persistSession:false,autoRefreshToken:false}})
const BASE='https://mb-partners.app', SHA=process.argv[2]??''
let pass=0,fail=0; const ok=(c:boolean,n:string,d='')=>{c?(pass++,console.log(' ✓',n)):(fail++,console.log(' ✗',n,d))}
const pw='Cc'+randomBytes(12).toString('base64url')+'!9'
const {data:l}=await a.auth.admin.listUsers()
const mon=(l?.users||[]).find((x:any)=>x.email==='cc-monitor@mb-system.internal')
await a.auth.admin.updateUserById(mon!.id,{password:pw})
const b=await chromium.launch()
// リファラル（monitor=役割なし）: 従来ホームのまま
const ctx=await b.newContext({viewport:{width:390,height:800}})
const ap=await ctx.newPage()
await ap.goto(BASE+'/app/login',{waitUntil:'domcontentloaded'});await ap.waitForTimeout(1500)
await ap.locator('input[type="email"]').fill('cc-monitor@mb-system.internal');await ap.locator('input[type="password"]').fill(pw)
await ap.locator('button[type="submit"]').first().click();await ap.waitForTimeout(3500)
await ap.goto(BASE+'/app',{waitUntil:'domcontentloaded'});await ap.waitForTimeout(3000)
const rt=await ap.evaluate(`document.body.innerText`) as string
ok(rt.includes('確定残高')&&!rt.includes('今月の全体像')&&!rt.includes('あなたの網'),'本番: リファラルホーム不変（ペルソナ要素なし）')
await ap.goto(BASE+'/app/settings',{waitUntil:'domcontentloaded'});await ap.waitForTimeout(2200)
ok(((await ap.evaluate(`document.body.innerText`)) as string).includes(SHA.slice(0,7)),'stamp=HEAD一致('+SHA.slice(0,7)+')')
await ctx.close()
// サプライヤー（ZZ6153・デモ満杯）: ミニコンソール実データ
const {data:link}=await a.auth.admin.generateLink({type:'magiclink',email:'test.kambara@gmail.com'})
const {data:vs}=await anon.auth.verifyOtp({type:'email',token_hash:link!.properties!.hashed_token})
const cookieVal='base64-'+Buffer.from(JSON.stringify({access_token:vs!.session!.access_token,refresh_token:vs!.session!.refresh_token,token_type:'bearer',expires_in:vs!.session!.expires_in,expires_at:vs!.session!.expires_at,user:vs!.session!.user}),'utf8').toString('base64url')
for(const vp of [{width:375,height:667},{width:1024,height:800}]){
  const c2=await b.newContext({viewport:vp})
  await c2.addCookies([{name:'mb-auth-app',value:cookieVal,url:BASE,httpOnly:false,secure:true,sameSite:'Lax' as const}])
  const p2=await c2.newPage(); const errs:string[]=[]; p2.on('pageerror',e=>errs.push(e.message))
  await p2.goto(BASE+'/app',{waitUntil:'domcontentloaded'});await p2.waitForTimeout(4000)
  const t=await p2.evaluate(`document.body.innerText`) as string
  const tag='['+vp.width+']'
  if(vp.width===375){
    ok(t.includes('今月の全体像')&&t.includes('¥10,800,000'),tag+' ミニコンソール: 成約受注額=デモ実数10,800,000')
    ok(t.includes('お支払い見込み'),tag+' 全体像: 支払見込み表示')
    ok(t.includes('リファラルを招待')&&t.includes('紹介する'),tag+' 最優先アクション帯')
    ok(t.includes('商品')&&t.includes('オムニス')&&t.includes('サービス設定'),tag+' 商品セクション（実ブランド）')
    ok(t.includes('案件とお金')&&t.includes('網の動き'),tag+' 案件とお金/網の動き')
    ok(t.includes('会社'),tag+' ナビ: 会社タブ')
  }
  ok((await p2.evaluate(`document.documentElement.scrollWidth`) as number)<=vp.width,tag+' 横はみ出しなし')
  ok(errs.length===0,tag+' pageerrors=[]',JSON.stringify(errs))
  if(vp.width===375){
    await p2.goto(BASE+'/app/company',{waitUntil:'domcontentloaded'});await p2.waitForTimeout(3000)
    const ct=await p2.evaluate(`document.body.innerText`) as string
    ok(ct.includes('あなたの会社')&&ct.includes('サービス設定'),tag+' 会社タブ: 商品/お金/委託/変更申請の器')
    await p2.goto(BASE+'/app/supplier',{waitUntil:'domcontentloaded'});await p2.waitForTimeout(2500)
    ok(!p2.url().includes('/app/supplier')&&!p2.url().includes('dashboard'),tag+' 旧URL→ホームへ')
  }
  await c2.close()
}
await b.close(); console.log('PROD8:',pass+'/'+(pass+fail)); process.exit(fail>0?1:0)
