import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { chromium } from 'playwright'
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^"|"$/g,'')]}))
const admin=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
const {data:link}=await admin.auth.admin.generateLink({type:'magiclink',email:'katsuhiko-demo@mb-demo.test'})
const {data:vfy}=await admin.auth.verifyOtp({type:'magiclink',token_hash:link.properties.hashed_token})
const s=vfy.session,jar={}
const ssr=createServerClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{cookieOptions:{name:'mb-auth-app'},cookies:{getAll:()=>Object.entries(jar).map(([name,value])=>({name,value})),setAll:a=>a.forEach(({name,value})=>{jar[name]=value})}})
await ssr.auth.setSession({access_token:s.access_token,refresh_token:s.refresh_token})
const cookies=Object.entries(jar).map(([name,value])=>({name,value,domain:'mb-partners.app',path:'/',httpOnly:false,secure:true,sameSite:'Lax'}))
const b=await chromium.launch();const c=await b.newContext({viewport:{width:375,height:780}});await c.addCookies(cookies);const p=await c.newPage()
await p.goto('https://mb-partners.app/app/refer',{waitUntil:'domcontentloaded',timeout:45000})
try{await p.waitForLoadState('networkidle',{timeout:8000})}catch{}
await p.waitForTimeout(1500)
// search path → MOOM only → expand → pick fixed menu お部屋探し → form
await p.fill('input[placeholder="ブランド・メニューを探す"]','部屋'); await p.waitForTimeout(600)
await p.evaluate(()=>{const x=[...document.querySelectorAll('.ob-card button')].find(y=>/MOOM/.test(y.textContent||''));if(x)x.click()})
await p.waitForTimeout(700)
await p.evaluate(()=>{const r=[...document.querySelectorAll('button')].filter(y=>/お部屋探し/.test(y.textContent||''));const z=r[r.length-1];if(z)z.click()})
await p.waitForTimeout(1200)
const R=await p.evaluate(()=>({
  url:location.pathname,
  has_form:!!document.querySelector('form'),
  has_submit:[...document.querySelectorAll('button')].some(b=>/紹介する/.test(b.textContent||'')),
  submit_disabled:(()=>{const b=[...document.querySelectorAll('button')].find(x=>/紹介する/.test(x.textContent||''));return b?b.disabled:null})(),
  has_customer_section:/お客さまの情報/.test(document.body.innerText),
  has_task_check:/担う|協力|つなぐ/.test(document.body.innerText),
}))
console.log(JSON.stringify(R,null,2))
await b.close()
