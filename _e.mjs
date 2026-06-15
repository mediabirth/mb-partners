import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
const env=Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')&&!l.trim().startsWith('#')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'")))v=v.slice(1,-1);return[l.slice(0,i).trim(),v];}))
const SURL=env.NEXT_PUBLIC_SUPABASE_URL,SVCK=env.SUPABASE_SERVICE_ROLE_KEY,BASE='http://localhost:3001',OUT='docs/reports/review_screens/e';fs.mkdirSync(OUT,{recursive:true})
const ref=new URL(SURL).hostname.split('.')[0]
const mk=(s)=>({name:`sb-${ref}-auth-token`,value:'base64-'+Buffer.from(JSON.stringify(s),'utf8').toString('base64url'),url:BASE,httpOnly:false,secure:false,sameSite:'Lax'})
const svc=createClient(SURL,SVCK,{auth:{autoRefreshToken:false,persistSession:false}})
const b=await chromium.launch()
const {data:link}=await svc.auth.admin.generateLink({type:'magiclink',email:env.SCREENSHOT_ADMIN_EMAIL,options:{redirectTo:'https://mb-partners.app/login'}})
const t=await b.newContext();const tp=await t.newPage();await tp.goto(link.properties.action_link);await tp.waitForTimeout(3000)
const u=tp.url();const tok=Object.fromEntries(new URLSearchParams(u.slice(u.indexOf('#')+1)).entries());await t.close()
const pl=JSON.parse(Buffer.from(tok.access_token.split('.')[1],'base64url').toString())
const A={access_token:tok.access_token,refresh_token:tok.refresh_token,token_type:'bearer',expires_in:3600,expires_at:Number(tok.expires_at),user:{id:pl.sub,email:pl.email,role:'authenticated',aal:pl.aal}}
const c=await b.newContext({viewport:{width:1440,height:1000}});await c.addCookies([mk(A)]);const pg=await c.newPage()
const bad=[]
// smoke
for(const p of ['/console','/console/deals','/console/payouts','/console/inquiries','/console/broadcasts','/console/services','/console/partners','/console/settings','/console/partners/invite']){const r=await pg.goto(BASE+p);await pg.waitForTimeout(800);const err=await pg.evaluate(()=>document.body.innerText.includes("couldn't load")||document.body.innerText.includes('A server error'));if(err)bad.push(p);console.log(`${err?'✗':'✓'} ${p} [${r.status()}]`)}
// ② login page renders, no 2FA wording
await pg.goto(BASE+'/console/login');await pg.waitForTimeout(800)
const loginTxt=await pg.evaluate(()=>document.body.innerText)
console.log('② login: has 2段階?', loginTxt.includes('2段階'), '| has ログインbtn?', loginTxt.includes('ログイン'))
// ③ services rename
await pg.goto(BASE+'/console/services');await pg.waitForTimeout(1500)
console.log('③ services h1:', await pg.evaluate(()=>document.querySelector('h1')?.textContent))
// ④ invite has owner?
await pg.goto(BASE+'/console/partners/invite');await pg.waitForTimeout(1000)
console.log('④ invite has オーナー option?', await pg.evaluate(()=>document.body.innerText.includes('オーナー') && !!document.querySelector('option[value="owner"]')))
// ⑧ broadcasts emoji?
await pg.goto(BASE+'/console/broadcasts');await pg.waitForTimeout(1200)
console.log('⑧ broadcasts has 📣?', await pg.evaluate(()=>document.body.innerText.includes('📣')))
// ① deals detail base edit
await pg.goto(BASE+'/console/deals');await pg.waitForTimeout(2000)
await pg.screenshot({path:`${OUT}/deals_board.png`,fullPage:true})
await pg.getByText('高橋 家具',{exact:false}).first().click();await pg.waitForTimeout(700)
const hasSection=await pg.evaluate(()=>document.body.innerText.includes('実績金額'))
console.log('① detail 実績金額 section:', hasSection)
await pg.screenshot({path:`${OUT}/deal_detail.png`})
// edit base 150000->200000
await pg.getByRole('button',{name:/金額を(編集|入力)/}).first().click();await pg.waitForTimeout(400)
await pg.locator('input[placeholder*="実額"]').fill('200000');await pg.waitForTimeout(300)
await pg.screenshot({path:`${OUT}/deal_detail_edit.png`})
await pg.getByRole('button',{name:'保存',exact:true}).click();await pg.waitForTimeout(1500)
console.log('BAD:',bad.length?bad.join(','):'none ✓')
await b.close()
