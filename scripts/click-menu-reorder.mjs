import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { chromium } from 'playwright'

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n')
  .filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const URL = env.NEXT_PUBLIC_SUPABASE_URL, ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY, SR = env.SUPABASE_SERVICE_ROLE_KEY
const HOST = 'console.mb-partners.app', ORIGIN = 'https://' + HOST
const admin = createClient(URL, SR, { auth: { persistSession: false, autoRefreshToken: false } })

const { data: sm } = await admin.from('service_menus').select('id').eq('service_id', 'reso')
const smIds = sm.map(x => x.id)
const dbOrder = async () => (await admin.from('menus').select('name,sort').in('service_menu_id', smIds).order('sort')).data.map(m => `${m.name}(${m.sort})`).join(' , ')

// 既知状態へリセット: 受託開発=0,サイト制作=1,ロゴ制作=2,撮影=3
const { data: menus } = await admin.from('menus').select('id,name').in('service_menu_id', smIds)
const order0 = ['受託開発', 'サイト制作', 'ロゴ制作', '撮影']
for (let i = 0; i < order0.length; i++) { const m = menus.find(x => x.name === order0[i]); if (m) await admin.from('menus').update({ sort: i }).eq('id', m.id) }
console.log('RESET :', await dbOrder())

const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email: 'mediabirth.project@gmail.com' })
const { data: vfy } = await admin.auth.verifyOtp({ type: 'magiclink', token_hash: link.properties.hashed_token })
const jar = {}
const ssr = createServerClient(URL, ANON, { cookieOptions: { name: 'mb-auth-console' },
  cookies: { getAll: () => Object.entries(jar).map(([name, value]) => ({ name, value })), setAll: (a) => a.forEach(({ name, value }) => { jar[name] = value }) } })
await ssr.auth.setSession({ access_token: vfy.session.access_token, refresh_token: vfy.session.refresh_token })
const cookies = Object.entries(jar).map(([name, value]) => ({ name, value, domain: HOST, path: '/', httpOnly: false, secure: true, sameSite: 'Lax' }))

const browser = await chromium.launch()
const ctx = await browser.newContext()
await ctx.addCookies(cookies)
const page = await ctx.newPage()
const pErr = []
page.on('pageerror', e => pErr.push(String(e).slice(0, 120)))
const patches = []
page.on('request', r => { if (r.method() === 'PATCH' && r.url().includes('/api/console/menus/')) patches.push(r.url().split('/menus/')[1]) })

await page.goto(ORIGIN + '/console/services', { waitUntil: 'domcontentloaded', timeout: 45000 })
for (let i = 0; i < 8; i++) await page.waitForTimeout(800)

// 受託開発 のメニュー行を見つけ、その行の ▼ ボタンをクリック（DOM walk）
const clicked = await page.evaluate(() => {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  let node
  while ((node = walker.nextNode())) {
    if (node.textContent.trim() === '受託開発') {
      let row = node.parentElement
      for (let up = 0; up < 6 && row; up++, row = row.parentElement) {
        const downBtn = [...row.querySelectorAll('button')].find(b => b.textContent.trim() === '▼' && !b.disabled)
        if (downBtn) { downBtn.click(); return true }
      }
    }
  }
  return false
})
console.log('clicked ▼ on 受託開発 row:', clicked)
for (let i = 0; i < 6; i++) await page.waitForTimeout(700)

console.log('PATCH menus fired:', patches.length, patches)
console.log('AFTER :', await dbOrder())
console.log('page errors:', JSON.stringify(pErr.slice(0, 4)))
await browser.close()
