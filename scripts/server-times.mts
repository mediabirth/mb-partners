/** A計測: 主要ページ/APIのwarmサーバ時間（認証済み・5回中央値）。throwaway自動撤去。 */
import { readFileSync, appendFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { chromium, type APIRequestContext } from 'playwright'
const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const BASE = 'http://localhost:4599', PW = 'CcSt!2026xx', LABEL = process.argv[2] ?? 'run'
const OWNER = 'cc-st-owner@mb-system.internal', REF = 'cc-st-ref@mb-system.internal', SUP = 'cc-st-sup@mb-system.internal'
const OUT = '/private/tmp/claude-501/-Users-kmbrkthk/3c01494a-a62a-4e0d-b895-09f7cc0f5b0c/scratchpad/server-times.jsonl'

async function cleanup() {
  const { data: svc } = await admin.from('services').select('id').eq('name', 'CC-STブランド').maybeSingle()
  if (svc) await admin.from('services').delete().eq('id', svc.id)
  const { data: l } = await admin.auth.admin.listUsers()
  for (const em of [REF, SUP, OWNER]) { const u = (l?.users || []).find((x: any) => x.email === em); if (u) { const { data: pa } = await admin.from('partners').select('id').eq('profile_id', u.id).maybeSingle(); if (pa) await admin.from('partners').delete().eq('id', pa.id); await admin.from('profiles').delete().eq('id', u.id); await admin.auth.admin.deleteUser(u.id).catch(() => {}) } }
}
await cleanup()
const mk = async (email: string, name: string, role: string) => { const c = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true, app_metadata: { role } }); await admin.from('profiles').upsert({ id: c.data!.user!.id, name, role, email, color: '#888' }); return c.data!.user!.id }
await mk(OWNER, 'CC-ST運営', 'owner')
const refUid = await mk(REF, 'CC-ST紹介', 'partner'); await admin.from('partners').insert({ profile_id: refUid, code: 'CCST02', status: 'active' })
const supUid = await mk(SUP, 'CC-ST供給者', 'partner')
const supPid = (await admin.from('partners').insert({ profile_id: supUid, code: 'CCST01', company_name: '株式会社CC-ST', status: 'active' }).select('id').single()).data!.id
await admin.from('services').insert({ name: 'CC-STブランド', active: true, supplier_partner_id: supPid, icon: '🧪', color: '#4733E6' })

const b = await chromium.launch()
async function authedCtx(email: string, path: string): Promise<APIRequestContext> {
  const ctx = await b.newContext()
  const p = await ctx.newPage()
  await p.goto(BASE + path, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1200)
  if (await p.locator('input[type="email"]').count()) {
    await p.locator('input[type="email"]').fill(email); await p.locator('input[type="password"]').fill(PW)
    await p.locator('button[type="submit"]').first().click(); await p.waitForTimeout(2600)
  }
  return ctx.request
}
const med = (xs: number[]) => xs.sort((a, b2) => a - b2)[Math.floor(xs.length / 2)]
async function t5(req: APIRequestContext, url: string): Promise<number> {
  const xs: number[] = []
  for (let i = 0; i < 5; i++) { const t0 = Date.now(); await req.get(BASE + url); xs.push(Date.now() - t0) }
  return med(xs)
}

const rows: { label: string; who: string; url: string; ms: number }[] = []
const oreq = await authedCtx(OWNER, '/console')
for (const u of ['/console', '/console/deals', '/api/console/deals', '/console/partners', '/api/console/partners', '/console/services', '/api/console/services', '/console/payouts', '/api/console/payouts', '/api/console/delivery-payouts', '/api/console/supplier-charges']) rows.push({ label: LABEL, who: 'owner', url: u, ms: await t5(oreq, u) })
const rreq = await authedCtx(REF, '/app')
for (const u of ['/app', '/app/refer', '/app/cases', '/app/rewards', '/api/notifications/unread']) rows.push({ label: LABEL, who: 'referral', url: u, ms: await t5(rreq, u) })
const sreq = await authedCtx(SUP, '/app')
for (const u of ['/app', '/app/s/deals', '/api/supplier/self', '/app/s/money', '/app/s/partners', '/app/s/products']) rows.push({ label: LABEL, who: 'supplier', url: u, ms: await t5(sreq, u) })
await b.close()
for (const r of rows) appendFileSync(OUT, JSON.stringify(r) + '\n')
console.table(rows.map(r => ({ who: r.who, url: r.url, ms: r.ms })))
await cleanup()
console.log('done', LABEL)
