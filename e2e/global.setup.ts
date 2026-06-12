import { chromium } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { mkdirSync, writeFileSync, readFileSync } from 'fs'
import { resolve } from 'path'
import { randomUUID } from 'crypto'
import { E2E } from './test-constants'

// ─── Load .env.local ─────────────────────────────────────────────────────────
function loadEnvLocal() {
  try {
    const content = readFileSync(resolve(__dirname, '../.env.local'), 'utf-8')
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const idx = trimmed.indexOf('=')
      if (idx < 1) continue
      const key = trimmed.slice(0, idx).trim()
      let val = trimmed.slice(idx + 1).trim()
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1)
      }
      if (!process.env[key]) process.env[key] = val
    }
  } catch { /* ignore */ }
}
loadEnvLocal()

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON_KEY     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!

// ─── Cookie helper ────────────────────────────────────────────────────────────
// @supabase/ssr v0.12+ stores sessions as:  "base64-" + base64url(JSON.stringify(session))
// Cookie name: sb-{project-ref}-auth-token
function makeSessionCookies(session: object) {
  const projectRef = new URL(SUPABASE_URL).hostname.split('.')[0]
  const key        = `sb-${projectRef}-auth-token`
  const json       = JSON.stringify(session)
  const value      = `base64-${Buffer.from(json, 'utf-8').toString('base64url')}`

  // Check if chunking needed (MAX_CHUNK_SIZE = 3180 on encodeURIComponent length)
  const encoded = encodeURIComponent(value) // base64url chars are URL-safe, so same length
  if (encoded.length <= 3180) {
    return [{ name: key, value, url: 'http://localhost:3000',
              httpOnly: false, secure: false, sameSite: 'Lax' as const }]
  }

  // Chunked (rare for typical sessions, but handled)
  const chunks: Array<{ name: string; value: string }> = []
  let remaining = encoded
  let i = 0
  while (remaining.length > 0) {
    let chunk = remaining.slice(0, 3180)
    // Avoid splitting a %XX sequence
    while (chunk.length > 0 && chunk.at(-1) === '%') chunk = chunk.slice(0, -1)
    while (chunk.length > 1 && chunk.at(-2) === '%') chunk = chunk.slice(0, -2)
    chunks.push({ name: i === 0 ? key : `${key}.${i}`, value: decodeURIComponent(chunk) })
    remaining = remaining.slice(chunk.length)
    i++
  }
  return chunks.map(c => ({ ...c, url: 'http://localhost:3000',
                             httpOnly: false, secure: false, sameSite: 'Lax' as const }))
}

// ─── Get or create auth user ─────────────────────────────────────────────────
async function getOrCreateUser(
  service: ReturnType<typeof createClient>,
  authClient: ReturnType<typeof createClient>,
  email: string,
  password: string,
) {
  const { data: created, error: createErr } = await service.auth.admin.createUser({
    email, password, email_confirm: true,
  })
  if (!createErr && created?.user) return created.user

  // User already exists — sign in to retrieve the user object
  // (listUsers admin API may not be available on this project)
  const { data: signIn, error: signInErr } = await authClient.auth.signInWithPassword({ email, password })
  if (!signInErr && signIn?.user) {
    return signIn.user
  }

  throw new Error(
    `Cannot get/create user ${email} — ` +
    `createUser: "${createErr?.message}", ` +
    `signIn: "${signInErr?.message}"`
  )
}

// ─── Main setup ───────────────────────────────────────────────────────────────
export default async function globalSetup() {
  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
    throw new Error('Missing Supabase env vars — check .env.local')
  }

  const service = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const authClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // ── 1. Auth users ──────────────────────────────────────────────
  const adminUser    = await getOrCreateUser(service, authClient, E2E.ADMIN_EMAIL, E2E.ADMIN_PASS)
  const partnerUser  = await getOrCreateUser(service, authClient, E2E.PARTNER_EMAIL, E2E.PARTNER_PASS)
  const partner2User = await getOrCreateUser(service, authClient, E2E.PARTNER2_EMAIL, E2E.PARTNER2_PASS)

  // ── 2. Profiles ────────────────────────────────────────────────
  console.log('[setup] adminUser.id:', adminUser?.id, 'partnerUser.id:', partnerUser?.id, 'partner2User.id:', partner2User?.id)
  const { error: profErr } = await service.from('profiles').upsert([
    { id: adminUser!.id,    name: 'E2E管理者',        role: 'owner',   color: '#4733E6', email: E2E.ADMIN_EMAIL },
    { id: partnerUser!.id,  name: 'E2Eパートナー',    role: 'partner', color: '#C2479E', email: E2E.PARTNER_EMAIL },
    { id: partner2User!.id, name: 'E2E法人パートナー', role: 'partner', color: '#4CAF50', email: E2E.PARTNER2_EMAIL },
  ], { onConflict: 'id' })
  if (profErr) throw new Error(`profiles upsert failed: ${profErr.message}`)
  console.log('[setup] profiles upserted OK')

  // ── 3. Partner records ─────────────────────────────────────────
  // Individual partner (tax_type='individual')
  const { data: existingPartner } = await service.from('partners')
    .select('id').eq('profile_id', partnerUser!.id).maybeSingle()
  let partnerRecord: { id: string } | null = existingPartner as { id: string } | null
  if (!partnerRecord) {
    const { data: inserted, error: pErr } = await service.from('partners')
      .insert({ id: randomUUID(), profile_id: partnerUser!.id, code: E2E.PARTNER_CODE, status: 'active', tax_type: 'individual' })
      .select('id').single()
    if (pErr) throw new Error(`partner insert failed: ${pErr.message}`)
    partnerRecord = inserted as { id: string }
  } else {
    await service.from('partners').update({ code: E2E.PARTNER_CODE, status: 'active', tax_type: 'individual' }).eq('id', partnerRecord.id)
  }

  // Corporate partner (tax_type='corporate') — M3 tax comparison test
  const { data: existingPartner2 } = await service.from('partners')
    .select('id').eq('profile_id', partner2User!.id).maybeSingle()
  let partner2Record: { id: string } | null = existingPartner2 as { id: string } | null
  if (!partner2Record) {
    const { data: inserted2, error: p2Err } = await service.from('partners')
      .insert({ id: randomUUID(), profile_id: partner2User!.id, code: E2E.PARTNER2_CODE, status: 'active', tax_type: 'corporate' })
      .select('id').single()
    if (p2Err) throw new Error(`partner2 insert failed: ${p2Err.message}`)
    partner2Record = inserted2 as { id: string }
  } else {
    await service.from('partners').update({ code: E2E.PARTNER2_CODE, status: 'active', tax_type: 'corporate' }).eq('id', partner2Record.id)
  }

  // ── 4. Test service ────────────────────────────────────────────
  // Upsert by name (delete + reinsert if no unique constraint)
  let testService: { id: string } | null = null
  {
    const existing = await service.from('services').select('id').eq('name', E2E.SERVICE_NAME).maybeSingle()
    if (existing.data) {
      testService = existing.data as { id: string }
      await service.from('services').update({ active: true, sort: 9999 }).eq('id', testService.id)
    } else {
      const { data, error: insErr } = await service.from('services')
        .insert({ id: 'e2etest', name: E2E.SERVICE_NAME, subtitle: 'E2Eテスト用', icon: 'home', color: '#4733E6', rail: 'std', active: true, sort: 9999 })
        .select('id').single()
      if (insErr) throw new Error(`service insert failed: ${insErr.message}`)
      testService = data as { id: string }
    }
  }

  // ── 5. Test menu (¥80,000 fixed) ──────────────────────────────
  await service.from('service_menus').delete().eq('service_id', testService!.id)
  const { data: testMenu, error: menuErr } = await service.from('service_menus')
    .insert({ id: randomUUID(), service_id: testService!.id, name: 'E2Eメニュー', ref_type: 'fixed', ref_value: E2E.REWARD_AMOUNT, sort: 1 })
    .select('id').single()
  if (menuErr) throw new Error(`service_menu insert failed: ${menuErr.message}`)

  // ── 6. Referral token ──────────────────────────────────────────
  // Use delete+insert to avoid dependency on unique constraint
  await service.from('referral_links').delete().eq('token', E2E.REFERRAL_TOKEN)
  const { error: linkErr } = await service.from('referral_links')
    .insert({ partner_id: partnerRecord!.id, service_id: testService!.id, token: E2E.REFERRAL_TOKEN })
  if (linkErr) throw new Error(`referral_link insert failed: ${linkErr.message}`)

  // ── 7. Pre-existing deals ──────────────────────────────────────
  // Clean up any previous test deals first
  await service.from('deals').delete().eq('customer_name', E2E.CUSTOMER_PAYOUT)
  await service.from('deals').delete().eq('customer_name', E2E.CUSTOMER_CANCEL)
  await service.from('deals').delete().eq('customer_name', E2E.CUSTOMER_REFERRAL)
  await service.from('deals').delete().eq('customer_name', E2E.CUSTOMER_CORP)

  // Clean up any previous test payout batches
  await service.from('payout_items').delete().in('partner_id', [partnerRecord!.id, partner2Record!.id])
  await service.from('payout_batches').delete().eq('month', `${E2E.FIXED_MONTH}`)

  // Payout math deal — individual partner (status=confirmed, fixed_month=2026-06)
  await service.from('deals').insert({
    partner_id:      partnerRecord!.id,
    service_id:      testService!.id,
    menu_id:         testMenu!.id,
    customer_name:   E2E.CUSTOMER_PAYOUT,
    channel:         'referral',
    source:          'link',
    status:          'confirmed',
    amount:          E2E.REWARD_AMOUNT,
    fixed_month:     E2E.FIXED_MONTH,
    consent:         true,
    reward_snapshot: { id: testMenu!.id, name: 'E2Eメニュー', ref_type: 'fixed', ref_value: E2E.REWARD_AMOUNT },
  })

  // Corporate partner deal (status=confirmed, fixed_month=2026-06) — no withholding
  await service.from('deals').insert({
    partner_id:      partner2Record!.id,
    service_id:      testService!.id,
    menu_id:         testMenu!.id,
    customer_name:   E2E.CUSTOMER_CORP,
    channel:         'referral',
    source:          'link',
    status:          'confirmed',
    amount:          E2E.REWARD_AMOUNT,
    fixed_month:     E2E.FIXED_MONTH,
    consent:         true,
    reward_snapshot: { id: testMenu!.id, name: 'E2Eメニュー', ref_type: 'fixed', ref_value: E2E.REWARD_AMOUNT },
  })

  // Cancel target deal (status=received)
  await service.from('deals').insert({
    partner_id:    partnerRecord!.id,
    service_id:    testService!.id,
    customer_name: E2E.CUSTOMER_CANCEL,
    channel:       'referral',
    source:        'link',
    status:        'received',
    amount:        50000,
    consent:       true,
  })

  // ── 8. Save test data IDs ──────────────────────────────────────
  mkdirSync(resolve(__dirname, 'storageState'), { recursive: true })
  writeFileSync(resolve(__dirname, '.test-data.json'), JSON.stringify({
    adminId:          adminUser!.id,
    partnerId:        partnerUser!.id,
    partner2Id:       partner2User!.id,
    partnerRecordId:  partnerRecord!.id,
    partner2RecordId: partner2Record!.id,
    serviceId:        testService!.id,
    menuId:           testMenu!.id,
  }, null, 2))

  // ── 9. Admin browser session ───────────────────────────────────
  const { data: adminAuth, error: adminAuthErr } = await authClient.auth.signInWithPassword({
    email: E2E.ADMIN_EMAIL,
    password: E2E.ADMIN_PASS,
  })
  if (adminAuthErr || !adminAuth.session) {
    throw new Error(`Admin sign-in failed: ${adminAuthErr?.message}`)
  }

  // ── 10. Partner browser session ────────────────────────────────
  const { data: partnerAuth, error: partnerAuthErr } = await authClient.auth.signInWithPassword({
    email: E2E.PARTNER_EMAIL,
    password: E2E.PARTNER_PASS,
  })
  if (partnerAuthErr || !partnerAuth.session) {
    throw new Error(`Partner sign-in failed: ${partnerAuthErr?.message}`)
  }

  // ── 11. Save storage states ────────────────────────────────────
  const browser = await chromium.launch()

  const adminCtx = await browser.newContext()
  await adminCtx.addCookies(makeSessionCookies(adminAuth.session))
  await adminCtx.storageState({ path: resolve(__dirname, 'storageState/admin.json') })

  const partnerCtx = await browser.newContext()
  await partnerCtx.addCookies(makeSessionCookies(partnerAuth.session))
  await partnerCtx.storageState({ path: resolve(__dirname, 'storageState/partner.json') })

  await browser.close()
  console.log('[setup] partnerRecordId:', partnerRecord!.id, 'serviceId:', testService!.id, 'menuId:', testMenu!.id)

  // ── Verify test data is accessible ────────────────────────────
  const { data: verifyLink, error: verifyErr } = await service.from('referral_links')
    .select('id, token, partner_id, service_id').eq('token', E2E.REFERRAL_TOKEN).maybeSingle()
  console.log('[setup] referral link check:', JSON.stringify(verifyLink), 'err:', verifyErr?.message)

  const { data: verifyDeals } = await service.from('deals')
    .select('customer_name, status').like('customer_name', 'E2Eテスト%')
  console.log('[setup] deals check:', JSON.stringify(verifyDeals))

  console.log('[setup] ✓ test data created, auth sessions saved')
}
