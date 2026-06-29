import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n')
  .filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const URL = env.NEXT_PUBLIC_SUPABASE_URL, ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY, SR = env.SUPABASE_SERVICE_ROLE_KEY
const ORIGIN = 'https://console.mb-partners.app'

const admin = createClient(URL, SR, { auth: { persistSession: false, autoRefreshToken: false } })
const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email: 'mediabirth.project@gmail.com' })
const { data: vfy } = await admin.auth.verifyOtp({ type: 'magiclink', token_hash: link.properties.hashed_token })
const jar = {}
const ssr = createServerClient(URL, ANON, { cookieOptions: { name: 'mb-auth-console' },
  cookies: { getAll: () => Object.entries(jar).map(([name, value]) => ({ name, value })), setAll: (a) => a.forEach(({ name, value }) => { jar[name] = value }) } })
await ssr.auth.setSession({ access_token: vfy.session.access_token, refresh_token: vfy.session.refresh_token })
const cookie = Object.entries(jar).map(([n, v]) => `${n}=${v}`).join('; ')

const an = await fetch(ORIGIN + '/api/console/analytics', { headers: { cookie } }).then(r => r.json())
const dl = await fetch(ORIGIN + '/api/console/deals', { headers: { cookie } }).then(r => r.json())
const svc = await fetch('https://mb-partners.app/api/services?cb=' + Math.floor(vfy.session.expires_at)).then(r => r.json())

// 決定論的な比較文字列：P&L集計(revenue/mbMargin/status)を id順、deals の委託費/経費を id順、services の menu数。
const pnl = (an.records ?? []).map(r => `${r.id}:rev=${r.revenue}:mb=${r.mbMargin}:st=${r.status}`).sort().join(' | ')
const deals = (dl.deals ?? []).map(d => `${d.id}:amt=${d.amount}:dc=${d._delivery_cost ?? 0}:de=${d._delivery_expense ?? 0}`).sort().join(' | ')
const services = (Array.isArray(svc) ? svc : []).map(s => `${s.id}:sm=${(s.service_menus ?? []).length}:mn=${(s.service_menus ?? []).reduce((a, m) => a + (m.menus ?? []).length, 0)}`).sort().join(' | ')
console.log('PNL ' + pnl)
console.log('DEALS ' + deals)
console.log('SVC ' + services)
