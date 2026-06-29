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
  cookies: { getAll: () => Object.entries(jar).map(([n, v]) => ({ name: n, value: v })), setAll: (a) => a.forEach(({ name, value }) => { jar[name] = value }) } })
await ssr.auth.setSession({ access_token: vfy.session.access_token, refresh_token: vfy.session.refresh_token })
const cookie = Object.entries(jar).map(([n, v]) => `${n}=${v}`).join('; ')

// 1) reso メニューを元状態（全 sort=0）へ復帰＝今回の検証で動かしたデータを原状回復
const { data: sm } = await admin.from('service_menus').select('id').eq('service_id', 'reso')
const smIds = sm.map(x => x.id)
await admin.from('menus').update({ sort: 0 }).in('service_menu_id', smIds)
const { data: restored } = await admin.from('menus').select('name,sort').in('service_menu_id', smIds)
console.log('reso RESTORED to original:', restored.every(m => m.sort === 0) ? 'all sort=0 ✓' : JSON.stringify(restored))

// 2) ブランド（services）並び替え 回帰チェック：実APIで2件 swap→200→DB反映→元に戻す
const { data: svcs } = await admin.from('services').select('id,sort').order('sort').limit(2)
if (svcs.length === 2) {
  const [a, b] = svcs
  const r1 = await fetch(`${ORIGIN}/api/console/services/${a.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify({ sort: b.sort }) })
  const r2 = await fetch(`${ORIGIN}/api/console/services/${b.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify({ sort: a.sort }) })
  const { data: mid } = await admin.from('services').select('id,sort').in('id', [a.id, b.id])
  const swapped = mid.find(s => s.id === a.id).sort === b.sort && mid.find(s => s.id === b.id).sort === a.sort
  // 元に戻す
  await fetch(`${ORIGIN}/api/console/services/${a.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify({ sort: a.sort }) })
  await fetch(`${ORIGIN}/api/console/services/${b.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify({ sort: b.sort }) })
  console.log(`brand reorder: PATCH ${r1.status}/${r2.status}, DB swap ${swapped ? '✓' : '✗'}, reverted to sort ${a.sort}/${b.sort}`)
}

// 3) money/menu_rewards 不変
const { data: pay } = await admin.from('payout_items').select('net')
console.log('payout ¥' + pay.reduce((s, p) => s + (p.net || 0), 0))
const { data: mr } = await admin.from('menu_rewards').select('id', { count: 'exact', head: false })
console.log('menu_rewards rows:', mr.length)
