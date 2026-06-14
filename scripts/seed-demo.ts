/**
 * Demo data seed for MB Partners
 * Usage: npx tsx scripts/seed-demo.ts
 *
 * Creates 3 partner users + deals in all statuses + payout batch + inquiries + notifications
 * Hides test services (テスト / APIテスト)
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'

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

const SUPABASE_URL      = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE_KEY       = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const svc  = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// ─── Helper ──────────────────────────────────────────────────────────────────
async function getOrCreateUser(email: string, password: string) {
  const { data: created, error: createErr } = await svc.auth.admin.createUser({
    email, password, email_confirm: true,
  })
  if (!createErr && created?.user) return created.user

  // Already exists — sign in
  const { data: signIn } = await anon.auth.signInWithPassword({ email, password })
  if (signIn?.user) return signIn.user

  throw new Error(`Could not get or create user: ${email} — ${createErr?.message}`)
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log('=== MB Partners Demo Seed ===\n')

  // ── 1. Get services ────────────────────────────────────────────────────────
  console.log('Fetching services...')
  const { data: services, error: svcErr } = await svc.from('services').select('id, name, active')
  if (svcErr) throw svcErr

  const TEST_NAMES = ['テスト', 'APIテスト', 'テスト用', 'test', 'Test']
  const svcMap: Record<string, string> = {}

  for (const s of services ?? []) {
    if (TEST_NAMES.includes(s.name)) {
      // Hide test services
      await svc.from('services').update({ active: false }).eq('id', s.id)
      console.log(`  Hidden test service: ${s.name}`)
    } else {
      svcMap[s.name] = s.id
    }
  }
  console.log('  Services:', Object.keys(svcMap).join(', '))

  // ── 2. Get admin user (for inquiry replies) ────────────────────────────────
  const adminEmail = process.env.SCREENSHOT_ADMIN_EMAIL || 'mediabirth.project@gmail.com'
  const { data: adminProfile } = await svc
    .from('profiles')
    .select('id, name')
    .eq('email', adminEmail)
    .maybeSingle()
  console.log(`\nAdmin: ${adminProfile?.name ?? 'not found'} (${adminProfile?.id ?? 'N/A'})`)

  // ── 3. Create demo partner users ───────────────────────────────────────────
  console.log('\nCreating demo partners...')

  const DEMO_PASSWORD = 'DemoPass123!'

  const demoUsers = [
    { email: 'katsuhiko-demo@mb-demo.test', name: '勝田 勝彦', code: 'KT8842', color: '#4733E6', tax_type: 'individual' },
    { email: 'sasaki-demo@mb-demo.test',    name: '佐々木 恵美', code: 'SS1203', color: '#1E9E6A', tax_type: 'individual' },
    { email: 'inoue-demo@mb-demo.test',     name: '井上 翔太',  code: 'IN0907', color: '#C07A12', tax_type: 'corporate'  },
  ]

  const partnerIds: string[] = []

  for (const u of demoUsers) {
    // Auth user
    const authUser = await getOrCreateUser(u.email, DEMO_PASSWORD)
    console.log(`  User: ${u.name} (${authUser.id})`)

    // Profile
    const { error: profErr } = await svc.from('profiles').upsert({
      id:       authUser.id,
      email:    u.email,
      name:     u.name,
      role:     'partner',
      color:    u.color,
    }, { onConflict: 'id' })
    if (profErr) console.warn('  Profile upsert error:', profErr.message)

    // Partner
    // Check by profile_id first, then by code
    let existingPartner = await svc.from('partners').select('id').eq('profile_id', authUser.id).maybeSingle()
    if (!existingPartner.data) {
      existingPartner = await svc.from('partners').select('id').eq('code', u.code).maybeSingle()
    }
    let partnerId: string

    if (existingPartner.data?.id) {
      partnerId = existingPartner.data.id
      // Update profile_id if needed
      await svc.from('partners').update({ profile_id: authUser.id, status: 'active', tax_type: u.tax_type }).eq('id', partnerId)
      console.log(`  Partner (existing): ${u.code} → ${partnerId}`)
    } else {
      const { data: newPartner, error: pErr } = await svc.from('partners').insert({
        profile_id: authUser.id,
        code:       u.code,
        status:     'active',
        tax_type:   u.tax_type,
      }).select('id').single()
      if (pErr) throw new Error(`Partner insert error for ${u.name}: ${pErr.message}`)
      partnerId = newPartner.id
      console.log(`  Partner (new): ${u.code} → ${partnerId}`)
    }

    partnerIds.push(partnerId)
  }

  const [katsuhikoId, sasakiId, inoueId] = partnerIds
  const moomId       = svcMap['MOOM']
  const matchhubId   = svcMap['MatchHub']
  const resonationId = svcMap['RESONATION']
  const pragmationId = svcMap['PRAGMATION']
  const emanationId  = svcMap['EMANATION']
  const entersologyId = svcMap['ENTERSOLOGY LIVE']

  // ── 4. Create deals ────────────────────────────────────────────────────────
  console.log('\nCreating deals...')

  const now = new Date()
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const lastMonth = (() => {
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })()

  // fixed_month must be DATE format (YYYY-MM-DD), use first day of month
  const lastMonthDate = `${lastMonth}-01`
  const thisMonthDate = `${thisMonth}-01`

  const dealsToCreate = [
    // 勝彦 (KT8842) — mix of channels and statuses
    { partner_id: katsuhikoId, service_id: moomId,       customer_name: '山田 健一',   channel: 'referral',    source: 'link',   status: 'received',    amount: 30000,  fixed_month: null,           meeting_at: null },
    { partner_id: katsuhikoId, service_id: matchhubId,   customer_name: '田中 美咲',   channel: 'referral',    source: 'link',   status: 'in_progress', amount: 30000,  fixed_month: null,           meeting_at: new Date(Date.now() + 2 * 86400000).toISOString() },
    { partner_id: katsuhikoId, service_id: moomId,       customer_name: '鈴木 不動産', channel: 'cooperation', source: 'manual', status: 'confirmed',   amount: 150000, fixed_month: lastMonthDate,  meeting_at: null },
    { partner_id: katsuhikoId, service_id: resonationId, customer_name: '佐藤 商事',   channel: 'referral',    source: 'link',   status: 'paid',        amount: 100000, fixed_month: lastMonthDate,  meeting_at: null },
    // 佐々木 (SS1203)
    { partner_id: sasakiId,    service_id: pragmationId, customer_name: '中村 DX合同会社', channel: 'referral', source: 'link',   status: 'received',    amount: 40000,  fixed_month: null,           meeting_at: null },
    { partner_id: sasakiId,    service_id: moomId,       customer_name: '高橋 家具',   channel: 'cooperation', source: 'manual', status: 'in_progress', amount: 75000,  fixed_month: null,           meeting_at: new Date(Date.now() + 86400000).toISOString() },
    { partner_id: sasakiId,    service_id: matchhubId,   customer_name: '小林 製造',   channel: 'referral',    source: 'link',   status: 'confirmed',   amount: 30000,  fixed_month: thisMonthDate,  meeting_at: null },
    // 井上 (IN0907)
    { partner_id: inoueId,     service_id: resonationId, customer_name: 'ブランドX株式会社', channel: 'referral', source: 'link',  status: 'received',    amount: 50000,  fixed_month: null,           meeting_at: null },
    ...(entersologyId ? [{ partner_id: inoueId, service_id: entersologyId, customer_name: 'クリエイターA', channel: 'referral', source: 'link', status: 'in_progress' as const, amount: 0, fixed_month: null, meeting_at: null }] : []),
    { partner_id: inoueId,     service_id: moomId,       customer_name: '渡辺 不動産事務所', channel: 'referral', source: 'link', status: 'paid',        amount: 30000,  fixed_month: lastMonthDate,  meeting_at: null },
  ]

  const createdDealIds: string[] = []
  for (const deal of dealsToCreate) {
    // Check if deal already exists (rough check by customer_name + partner_id)
    const existing = await svc.from('deals').select('id').eq('partner_id', deal.partner_id).eq('customer_name', deal.customer_name).maybeSingle()
    if (existing.data?.id) {
      console.log(`  Deal (existing): ${deal.customer_name}`)
      createdDealIds.push(existing.data.id)
      continue
    }
    const { data: d, error: dErr } = await svc.from('deals').insert({
      ...deal,
      consent: true,
    }).select('id').single()
    if (dErr) { console.warn(`  Deal error (${deal.customer_name}): ${dErr.message}`); continue }
    createdDealIds.push(d.id)
    console.log(`  Deal: ${deal.customer_name} (${deal.status})`)
  }

  // ── 5. Payout batch for last month ────────────────────────────────────────
  console.log('\nCreating payout batch...')
  const { data: batchResult, error: batchErr } = await svc.rpc('close_month_batch', { target_month: lastMonth })
  if (batchErr) {
    console.warn('  Payout batch error:', batchErr.message)
  } else {
    console.log('  Batch result:', JSON.stringify(batchResult, null, 2))
  }

  // ── 6. Inquiries ──────────────────────────────────────────────────────────
  console.log('\nCreating inquiries...')

  const inquiries = [
    { partner_id: katsuhikoId, category: 'reward', subject: '紹介報酬の計算方法について', body: '先月紹介した物件の報酬額が予想より少なかったです。計算方法を教えてください。', status: 'replied' },
    { partner_id: sasakiId,    category: 'deal',   subject: '案件のステータス変更ができません', body: 'MOOMで紹介した案件が「対応中」のままになっています。確認をお願いします。', status: 'open' },
  ]

  for (const inq of inquiries) {
    // Check existing
    const existing = await svc.from('inquiries').select('id').eq('partner_id', inq.partner_id).eq('subject', inq.subject).maybeSingle()
    if (existing.data?.id) {
      console.log(`  Inquiry (existing): ${inq.subject}`)
      continue
    }

    const { data: inquiry, error: inqErr } = await svc.from('inquiries').insert({
      partner_id: inq.partner_id,
      category:   inq.category,
      subject:    inq.subject,
      status:     inq.status,
    }).select('id').single()
    if (inqErr) { console.warn('  Inquiry error:', inqErr.message); continue }

    // Get partner profile_id for sender_profile_id
    const { data: partnerProfile } = await svc.from('partners').select('profile_id').eq('id', inq.partner_id).single()
    const partnerProfileId = partnerProfile?.profile_id

    // Partner's first message
    if (partnerProfileId) {
      const { error: msgErr1 } = await svc.from('inquiry_messages').insert({
        inquiry_id:        inquiry.id,
        sender_role:       'partner',
        body:              inq.body,
        sender_profile_id: partnerProfileId,
        created_by:        partnerProfileId,
      })
      if (msgErr1) console.warn('  Message 1 error:', msgErr1.message)
    }

    // Admin reply (if status is 'replied')
    if (inq.status === 'replied' && adminProfile?.id) {
      const { error: msgErr2 } = await svc.from('inquiry_messages').insert({
        inquiry_id:        inquiry.id,
        sender_role:       'owner',
        body:              '報酬の計算については、各サービスのガイドページをご確認ください。粗利ベースでの計算となります。詳細をご案内いたします。',
        sender_profile_id: adminProfile.id,
        created_by:        adminProfile.id,
      })
      if (msgErr2) console.warn('  Message 2 error:', msgErr2.message)
    }

    console.log(`  Inquiry: ${inq.subject}`)
  }

  // ── 7. Notifications ──────────────────────────────────────────────────────
  console.log('\nCreating notifications...')

  const notifications = [
    { partner_id: katsuhikoId, title: '案件が受付されました', body: '山田 健一さんからの案件を受け付けました。', ref: { type: 'deal' } },
    { partner_id: katsuhikoId, title: '先月の報酬明細が発行されました', body: `${lastMonth}月の確定報酬をお知らせします。`, ref: { type: 'payout', batch_id: 'batch' } },
    { partner_id: sasakiId,    title: '案件が受付されました', body: '中村 DX合同会社からの案件を受け付けました。', ref: { type: 'deal' } },
    { partner_id: sasakiId,    title: 'お問い合わせにご返信いたしました', body: '案件のステータスについてご確認ください。', ref: { type: 'inquiry_reply', inquiry_id: 'inquiry' } },
    { partner_id: inoueId,     title: '案件が受付されました', body: 'ブランドX株式会社からの案件を受け付けました。', ref: { type: 'deal' } },
  ]

  for (const n of notifications) {
    // Don't duplicate (skip if too many notifications already)
    const { count } = await svc.from('notifications').select('id', { count: 'exact', head: true }).eq('partner_id', n.partner_id)
    if ((count ?? 0) >= 10) { console.log(`  Notifications: skipping (already ${count})`); continue }

    const { error: nErr } = await svc.from('notifications').insert({
      partner_id: n.partner_id,
      title:      n.title,
      body:       n.body,
      ref:        n.ref,
    })
    if (nErr) console.warn('  Notification error:', nErr.message)
    else console.log(`  Notification: ${n.title}`)
  }

  console.log('\n=== Seed complete! ===')
  console.log('\nDemo partners:')
  console.log('  勝田 勝彦  | katsuhiko-demo@mb-demo.test | KT8842 | pw: DemoPass123!')
  console.log('  佐々木 恵美 | sasaki-demo@mb-demo.test   | SS1203 | pw: DemoPass123!')
  console.log('  井上 翔太  | inoue-demo@mb-demo.test     | IN0907 | pw: DemoPass123!')
}

main().catch(e => { console.error(e); process.exit(1) })
