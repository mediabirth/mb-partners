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

// reso のメニュー id を sort 昇順→現状順で取得
const { data: svcRow } = await admin.from('services').select('id').eq('id', 'reso').single()
const { data: sm } = await admin.from('service_menus').select('id').eq('service_id', 'reso')
const smIds = sm.map(x => x.id)
const { data: menus } = await admin.from('menus').select('id,name,sort').in('service_menu_id', smIds).order('sort').order('name')
console.log('BEFORE:', menus.map(m => `${m.name}(sort=${m.sort})`).join(' , '))

// ★実APIで並び替え：意図した新順序を sort=0..n で PATCH（= moveListMenu が叩く経路と同一エンドポイント）
const desired = ['受託開発', 'サイト制作', 'ロゴ制作', '撮影'].map(n => menus.find(m => m.name === n)).filter(Boolean)
const target = desired.length === menus.length ? desired : menus  // 名前不一致時は現状順をそのまま採番
for (let i = 0; i < target.length; i++) {
  const r = await fetch(`${ORIGIN}/api/console/menus/${target[i].id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify({ sort: i }),
  })
  console.log(`PATCH ${target[i].name} sort=${i} -> ${r.status}`)
}

// DB 実値 AFTER（API 経由で保存されたか）
const { data: after } = await admin.from('menus').select('id,name,sort').in('service_menu_id', smIds).order('sort')
console.log('AFTER :', after.map(m => `${m.name}(sort=${m.sort})`).join(' , '))

// APP 公開API（refer が読む services→service_menus→menus）が新 sort 順で返すか
const svc = await fetch('https://mb-partners.app/api/services?cb=' + Math.floor(vfy.session.expires_at)).then(r => r.json())
const resoSvc = (Array.isArray(svc) ? svc : []).find(s => s.id === 'reso')
const appMenus = (resoSvc?.service_menus ?? []).flatMap(x => (x.menus ?? [])).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
console.log('APP   :', appMenus.map(m => `${m.name}(sort=${m.sort})`).join(' , '))

// 一致判定（console DB sort順 == APP sort順）
const dbOrder = after.map(m => m.name).join('>')
const appOrder = appMenus.map(m => m.name).join('>')
console.log(dbOrder === appOrder ? 'MATCH ✓ console DB順==APP順' : `MISMATCH ✗ db[${dbOrder}] app[${appOrder}]`)
