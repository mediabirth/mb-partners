/**
 * M6C: 全テーブル RLS セキュリティ検証
 *
 * テスト構成:
 *   - anon (未認証): 全テーブルにアクセス不可
 *   - partner1: 自分のデータのみ読み書き可能
 *   - partner2: partner1 のデータを読めない（逆も然り）
 *   - service_role: 全件アクセス可能
 *
 * 検証テーブル:
 *   profiles / partners / deals / deal_events / notifications /
 *   payout_batches / payout_items / services / service_menus /
 *   referral_links / calendar_links / meetings / invites / bank_change_requests
 */
import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { E2E } from './test-constants'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!
const ANON_KEY     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// service_role client (bypasses RLS)
function sbAdmin() {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

// 認証済みクライアント (RLS が適用される)
function sbAs(email: string, password: string) {
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

// anon client
function sbAnon() {
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

// テストデータを読み込む
function loadTestData() {
  try {
    return JSON.parse(readFileSync(resolve(__dirname, '.test-data.json'), 'utf-8'))
  } catch {
    return null
  }
}

// パートナーユーザーとしてサインイン
async function signInAs(email: string, password: string) {
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error || !data.session) throw new Error(`Sign-in failed for ${email}: ${error?.message}`)
  return data.session.access_token
}

// JWT を使った認証済みクライアント
function sbWithJwt(jwt: string) {
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  })
  return client
}

// ── セットアップ ─────────────────────────────────────────────────────────────

let p1Jwt: string
let p2Jwt: string
let adminJwt: string
let td: {
  partnerId: string
  partner2Id: string
  partnerRecordId: string
  partner2RecordId: string
  serviceId: string
}

test.beforeAll(async () => {
  td = loadTestData()
  if (!td) throw new Error('.test-data.json not found — run global.setup.ts first')

  p1Jwt    = await signInAs(E2E.PARTNER_EMAIL,  E2E.PARTNER_PASS)
  p2Jwt    = await signInAs(E2E.PARTNER2_EMAIL, E2E.PARTNER2_PASS)
  adminJwt = await signInAs(E2E.ADMIN_EMAIL,    E2E.ADMIN_PASS)
})

// ── 1. anon: 全テーブルへのアクセスを拒否 ────────────────────────────────────
test.describe('M6C-1: anon アクセス全拒否', () => {
  const TABLES = [
    'profiles', 'partners', 'deals', 'deal_events', 'notifications',
    'payout_batches', 'payout_items', 'services', 'service_menus',
    'referral_links', 'calendar_links', 'meetings', 'invites', 'bank_change_requests',
  ]

  for (const table of TABLES) {
    test(`anon → ${table}: 0件（RLS ブロック）`, async () => {
      const anon = sbAnon()
      const { data, error } = await anon.from(table).select('id').limit(10)
      // エラーまたは空配列（RLS で全件拒否）
      expect(
        (data ?? []).length,
        `anon が ${table} を読めた: ${JSON.stringify(data)}`
      ).toBe(0)
    })
  }
})

// ── 2. partner: 自分のデータのみ読める ───────────────────────────────────────
test.describe('M6C-2: partner は自分のデータのみ読める', () => {

  test('profiles: 自分のプロフィールのみ', async () => {
    const p1 = sbWithJwt(p1Jwt)
    const { data } = await p1.from('profiles').select('id, email').limit(100)
    // 自分のプロフィールのみ（他パートナーは見えない）
    const emails = (data ?? []).map((r: { email: string }) => r.email)
    expect(emails).toContain(E2E.PARTNER_EMAIL)
    expect(emails).not.toContain(E2E.PARTNER2_EMAIL)
    expect(emails).not.toContain(E2E.ADMIN_EMAIL)
  })

  test('partners: 自分のパートナーレコードのみ', async () => {
    const p1 = sbWithJwt(p1Jwt)
    const { data } = await p1.from('partners').select('id, code').limit(100)
    const codes = (data ?? []).map((r: { code: string }) => r.code)
    expect(codes).toContain(E2E.PARTNER_CODE)
    expect(codes).not.toContain(E2E.PARTNER2_CODE)
  })

  test('deals: 自分の案件のみ（他パートナーの案件は見えない）', async () => {
    const p1 = sbWithJwt(p1Jwt)
    const p2 = sbWithJwt(p2Jwt)

    const { data: p1Deals } = await p1.from('deals').select('id, customer_name').limit(100)
    const { data: p2Deals } = await p2.from('deals').select('id, customer_name').limit(100)

    const p1Names = (p1Deals ?? []).map((d: { customer_name: string }) => d.customer_name)
    const p2Names = (p2Deals ?? []).map((d: { customer_name: string }) => d.customer_name)

    // partner1 は自分の案件を見られる
    expect(p1Names.some(n => n.includes('E2Eテスト'))).toBe(true)
    // partner1 は partner2 の案件 (CUSTOMER_CORP) を見られない
    expect(p1Names).not.toContain(E2E.CUSTOMER_CORP)
    // partner2 は partner1 の案件 (CUSTOMER_PAYOUT) を見られない
    expect(p2Names).not.toContain(E2E.CUSTOMER_PAYOUT)
    expect(p2Names).not.toContain(E2E.CUSTOMER_CANCEL)
  })

  test('deal_events: 他パートナーの案件イベントを読めない', async () => {
    const admin = sbAdmin()
    const p1 = sbWithJwt(p1Jwt)

    // partner2 の案件を取得
    const { data: p2Deals } = await admin
      .from('deals').select('id').eq('partner_id', td.partner2RecordId).limit(1)
    if (!p2Deals || p2Deals.length === 0) return

    const p2DealId = p2Deals[0].id

    // partner1 で partner2 の案件イベントを取得しようとする
    const { data } = await p1.from('deal_events')
      .select('id').eq('deal_id', p2DealId).limit(10)
    expect((data ?? []).length).toBe(0)
  })

  test('notifications: 自分の通知のみ', async () => {
    const admin = sbAdmin()
    // partner2 に通知を作成
    const { error } = await admin.from('notifications').insert({
      partner_id: td.partner2RecordId,
      title: 'P2専用通知テスト',
    })
    expect(error).toBeNull()

    // partner1 で通知一覧を取得
    const p1 = sbWithJwt(p1Jwt)
    const { data } = await p1.from('notifications').select('title').limit(100)
    const titles = (data ?? []).map((n: { title: string }) => n.title)
    expect(titles).not.toContain('P2専用通知テスト')

    // クリーンアップ
    await admin.from('notifications').delete()
      .eq('partner_id', td.partner2RecordId).eq('title', 'P2専用通知テスト')
  })

  test('payout_items: 自分の支払明細のみ', async () => {
    const p1 = sbWithJwt(p1Jwt)
    const p2 = sbWithJwt(p2Jwt)
    const admin = sbAdmin()

    // partner2 に支払バッチを作成
    const { data: batch } = await admin.from('payout_batches')
      .insert({ month: '2026-01-01', status: 'open' }).select('id').single()
    if (!batch) return

    await admin.from('payout_items').insert({
      batch_id:   batch.id,
      partner_id: td.partner2RecordId,
      gross:      10000,
      withholding: 0,
      net:        10000,
    })

    // partner1 で取得
    const { data: p1Items } = await p1.from('payout_items')
      .select('partner_id').limit(100)
    const partnerIds = (p1Items ?? []).map((i: { partner_id: string }) => i.partner_id)
    expect(partnerIds).not.toContain(td.partner2RecordId)

    // クリーンアップ
    await admin.from('payout_items').delete().eq('batch_id', batch.id)
    await admin.from('payout_batches').delete().eq('id', batch.id)
  })

  test('referral_links: 自分の紹介リンクのみ', async () => {
    const p1 = sbWithJwt(p1Jwt)
    const admin = sbAdmin()

    // partner2 の紹介リンクを作成
    const { data: p2Link } = await admin.from('referral_links').insert({
      partner_id: td.partner2RecordId,
      service_id: td.serviceId,
      token: 'rls-test-p2-link',
    }).select('id').single()

    // partner1 で取得
    const { data } = await p1.from('referral_links')
      .select('partner_id').limit(100)
    const partnerIds = (data ?? []).map((r: { partner_id: string }) => r.partner_id)
    expect(partnerIds).not.toContain(td.partner2RecordId)

    // クリーンアップ
    await admin.from('referral_links').delete().eq('token', 'rls-test-p2-link')
  })

  test('calendar_links: 自分のカレンダーリンクのみ', async () => {
    const p1 = sbWithJwt(p1Jwt)
    const admin = sbAdmin()

    // partner2 にカレンダーリンクを作成
    await admin.from('calendar_links').upsert({
      partner_id:   td.partner2RecordId,
      active:       true,
      google_email: 'p2-test@example.com',
    }, { onConflict: 'partner_id' })

    // partner1 で取得
    const { data } = await p1.from('calendar_links')
      .select('partner_id').limit(100)
    const partnerIds = (data ?? []).map((r: { partner_id: string }) => r.partner_id)
    expect(partnerIds).not.toContain(td.partner2RecordId)

    // クリーンアップ
    await admin.from('calendar_links').delete().eq('partner_id', td.partner2RecordId)
  })

  test('meetings: 自分のミーティングのみ', async () => {
    const p1 = sbWithJwt(p1Jwt)
    const admin = sbAdmin()

    // partner2 にミーティングを作成
    const { data: mtg } = await admin.from('meetings').insert({
      partner_id:    td.partner2RecordId,
      customer_name: 'RLSテスト顧客',
      starts_at:     new Date().toISOString(),
      ends_at:       new Date(Date.now() + 3600000).toISOString(),
    }).select('id').single()

    // partner1 で取得
    const { data } = await p1.from('meetings')
      .select('partner_id').limit(100)
    const partnerIds = (data ?? []).map((r: { partner_id: string }) => r.partner_id)
    expect(partnerIds).not.toContain(td.partner2RecordId)

    // クリーンアップ
    if (mtg) await admin.from('meetings').delete().eq('id', mtg.id)
  })

  test('bank_change_requests: 自分の申請のみ', async () => {
    const p1 = sbWithJwt(p1Jwt)
    const admin = sbAdmin()

    // partner2 に申請を作成
    const { data: req } = await admin.from('bank_change_requests').insert({
      partner_id: td.partner2RecordId,
      new_bank:   { bank_name: 'RLSテスト銀行', branch_name: '支店', account_type: '普通', account_number: '0000001', account_holder: 'テスト' },
      status:     'pending',
    }).select('id').single()

    // partner1 で取得
    const { data } = await p1.from('bank_change_requests')
      .select('partner_id').limit(100)
    const partnerIds = (data ?? []).map((r: { partner_id: string }) => r.partner_id)
    expect(partnerIds).not.toContain(td.partner2RecordId)

    // クリーンアップ
    if (req) await admin.from('bank_change_requests').delete().eq('id', req.id)
  })

  test('invites: partner は invites を読めない', async () => {
    const p1 = sbWithJwt(p1Jwt)
    const { data } = await p1.from('invites').select('id').limit(10)
    expect((data ?? []).length).toBe(0)
  })

  test('payout_batches: partner は payout_batches を読めない', async () => {
    const p1 = sbWithJwt(p1Jwt)
    const { data } = await p1.from('payout_batches').select('id').limit(10)
    expect((data ?? []).length).toBe(0)
  })
})

// ── 3. services / service_menus: 認証済みユーザーは全員読める ─────────────────
test.describe('M6C-3: services/service_menus は認証済みで読める', () => {
  test('partner は services を読める', async () => {
    const p1 = sbWithJwt(p1Jwt)
    const { data } = await p1.from('services').select('id, name').limit(10)
    expect((data ?? []).length).toBeGreaterThan(0)
  })

  test('partner は service_menus を読める', async () => {
    const p1 = sbWithJwt(p1Jwt)
    const { data } = await p1.from('service_menus').select('id').limit(10)
    expect((data ?? []).length).toBeGreaterThan(0)
  })
})

// ── 4. 書き込み保護: partner が他人のレコードを書き換えられない ──────────────
test.describe('M6C-4: partner による不正書き込み拒否', () => {

  test('deals: 他パートナーの案件を UPDATE できない', async () => {
    const p1 = sbWithJwt(p1Jwt)
    const admin = sbAdmin()

    // partner2 の案件 ID を取得
    const { data: p2Deals } = await admin
      .from('deals').select('id').eq('partner_id', td.partner2RecordId).limit(1)
    if (!p2Deals || p2Deals.length === 0) {
      console.log('skip: no partner2 deals')
      return
    }

    const { error } = await p1.from('deals')
      .update({ customer_name: '不正書き換え' })
      .eq('id', p2Deals[0].id)

    // エラー or 0件更新（RLS で拒否）
    // Supabase は UPDATE で0件更新の場合でもエラーにならない場合があるので
    // 実際のデータが変わっていないことを確認
    const { data: check } = await admin
      .from('deals').select('customer_name').eq('id', p2Deals[0].id).single()
    expect(check?.customer_name).not.toBe('不正書き換え')
  })

  test('profiles: 他ユーザーのプロフィールを UPDATE できない', async () => {
    const p1 = sbWithJwt(p1Jwt)
    const admin = sbAdmin()

    await p1.from('profiles')
      .update({ name: '不正書き換え' })
      .eq('id', td.partner2Id)

    const { data: check } = await admin
      .from('profiles').select('name').eq('id', td.partner2Id).single()
    expect(check?.name).not.toBe('不正書き換え')
  })

  test('notifications: 他パートナーに通知を INSERT できない', async () => {
    const p1 = sbWithJwt(p1Jwt)
    const { error } = await p1.from('notifications').insert({
      partner_id: td.partner2RecordId,
      title: '不正通知',
    })
    // RLS で拒否されるべき
    expect(error).not.toBeNull()

    // 念のため実際に入ってないことを確認
    const admin = sbAdmin()
    const { data } = await admin.from('notifications')
      .select('id').eq('partner_id', td.partner2RecordId).eq('title', '不正通知')
    expect((data ?? []).length).toBe(0)
  })
})

// ── 5. 管理者: 全件アクセス可能 ─────────────────────────────────────────────
test.describe('M6C-5: 管理者は全パートナーのデータを読める', () => {
  test('admin は両パートナーの deals を読める', async () => {
    const admin = sbAdmin()
    const { data } = await admin.from('deals')
      .select('partner_id').limit(100)
    const partnerIds = (data ?? []).map((d: { partner_id: string }) => d.partner_id)
    expect(partnerIds).toContain(td.partnerRecordId)
    expect(partnerIds).toContain(td.partner2RecordId)
  })

  test('admin は invites を読める', async () => {
    const adminCl = sbWithJwt(adminJwt)
    const { data } = await adminCl.from('invites').select('id').limit(10)
    // エラーがなく（0件でも可）
    expect(data).not.toBeNull()
  })
})
