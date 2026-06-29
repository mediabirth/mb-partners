import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^"|"$/g,'')]}))
const admin=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
const {data:link}=await admin.auth.admin.generateLink({type:'magiclink',email:'mediabirth.project@gmail.com'})
const {data:vfy}=await admin.auth.verifyOtp({type:'magiclink',token_hash:link.properties.hashed_token})
const jar={}
const ssr=createServerClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{cookieOptions:{name:'mb-auth-console'},cookies:{getAll:()=>Object.entries(jar).map(([name,value])=>({name,value})),setAll:(a)=>a.forEach(({name,value})=>{jar[name]=value})}})
await ssr.auth.setSession({access_token:vfy.session.access_token,refresh_token:vfy.session.refresh_token})
const cookie=Object.entries(jar).map(([n,v])=>`${n}=${v}`).join('; ')
const r=await fetch('https://console.mb-partners.app/api/console/analytics',{headers:{cookie}})
console.log('analytics status',r.status); const j=await r.json().catch(()=>'(non-json)'); console.log('analytics keys:',Object.keys(j||{}).join(',')); console.log('analytics sample:',JSON.stringify(j).slice(0,400))
const r2=await fetch('https://console.mb-partners.app/api/console/deals',{headers:{cookie}})
const j2=await r2.json(); const td=(j2.deals??[]).find(d=>d.id.startsWith('d0000003')); console.log('testDeal keys:',Object.keys(td||{}).filter(k=>k.includes('deliver')||k==='amount'||k==='status').join(',')); console.log('testDeal:',JSON.stringify({amount:td?.amount,dc:td?._delivery_cost,de:td?._delivery_expense,st:td?.status}))
