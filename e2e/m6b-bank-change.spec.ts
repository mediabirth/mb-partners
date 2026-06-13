/**
 * M6B: 口座変更KYC承認フロー
 *
 * 1. パートナーが口座変更を申請できる（POST /api/bank-change-requests）
 * 2. 申請中は二重申請が拒否される（409）
 * 3. 管理者が承認すると partners.bank が更新される（最重要）
 * 4. 管理者が却下すると partners.bank は変更されない（最重要）
 * 5. 却下後にパートナーが再申請できる
 */
import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { E2E } from './test-constants'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!

function sb() {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

const NEW_BANK = {
  bank_name:      'テスト銀行',
  branch_name:    'テスト支店',
  account_type:   '普通',
  account_number: '1234567',
  account_holder: 'テスト タロウ',
}

const NEW_BANK_2 = {
  bank_name:      '第二テスト銀行',
  branch_name:    '第二支店',
  account_type:   '当座',
  account_number: '7654321',
  account_holder: 'テスト ジロウ',
}

// ── Helper: テスト前のクリーンアップ ──────────────────────────────────────
async function cleanupBankRequests() {
  const client = sb()
  const { data: partner } = await client
    .from('partners').select('id').eq('code', E2E.PARTNER_CODE).single()
  if (!partner) return
  await client.from('bank_change_requests').delete().eq('partner_id', partner.id)
  // bank をリセット
  await client.from('partners').update({ bank: null }).eq('id', partner.id)
}

// ── 1. パートナーが口座変更を申請できる ────────────────────────────────────
test.describe('M6B-1: 口座変更申請', () => {
  test.use({ storageState: 'e2e/storageState/partner.json' })

  test.beforeAll(async () => { await cleanupBankRequests() })
  test.afterAll(async ()  => { await cleanupBankRequests() })

  test('POST /api/bank-change-requests → 201 & id が返る', async ({ page }) => {
    const res = await page.request.post('/api/bank-change-requests', {
      data: NEW_BANK,
    })
    expect(res.status(), `申請失敗: ${await res.text()}`).toBe(201)
    const body = await res.json()
    expect(body.id).toBeTruthy()

    // DB に pending レコードが存在するか確認
    const { data: req } = await sb()
      .from('bank_change_requests')
      .select('status, new_bank')
      .eq('id', body.id)
      .single()
    expect(req?.status).toBe('pending')
    expect((req?.new_bank as typeof NEW_BANK).bank_name).toBe(NEW_BANK.bank_name)
  })
})

// ── 2. 二重申請が拒否される ───────────────────────────────────────────────
test.describe('M6B-2: 二重申請が拒否される', () => {
  test.use({ storageState: 'e2e/storageState/partner.json' })

  test.beforeAll(async () => {
    await cleanupBankRequests()
    // まず 1 件申請しておく
    const client = sb()
    const { data: partner } = await client
      .from('partners').select('id').eq('code', E2E.PARTNER_CODE).single()
    await client.from('bank_change_requests').insert({
      partner_id:  partner!.id,
      new_bank:    NEW_BANK,
      status:      'pending',
    })
  })
  test.afterAll(async () => { await cleanupBankRequests() })

  test('pending がある状態で再申請すると 409', async ({ page }) => {
    const res = await page.request.post('/api/bank-change-requests', {
      data: NEW_BANK_2,
    })
    expect(res.status()).toBe(409)
  })
})

// ── 3. 管理者が承認すると partners.bank が更新される ─────────────────────
test.describe('M6B-3: 承認で partners.bank が更新される', () => {
  test.use({ storageState: 'e2e/storageState/admin.json' })

  let requestId: string
  let partnerId: string

  test.beforeAll(async () => {
    await cleanupBankRequests()
    const client = sb()
    const { data: partner } = await client
      .from('partners').select('id').eq('code', E2E.PARTNER_CODE).single()
    partnerId = partner!.id

    const { data: req } = await client
      .from('bank_change_requests')
      .insert({ partner_id: partnerId, before_bank: null, new_bank: NEW_BANK, status: 'pending' })
      .select('id').single()
    requestId = req!.id
  })
  test.afterAll(async () => { await cleanupBankRequests() })

  test('承認後に partners.bank = new_bank になる', async ({ page }) => {
    // 承認前の bank は null
    const { data: before } = await sb()
      .from('partners').select('bank').eq('id', partnerId).single()
    expect(before?.bank).toBeNull()

    // 承認
    const res = await page.request.patch(
      `/api/console/bank-change-requests/${requestId}`,
      { data: { action: 'approve' } },
    )
    expect(res.status(), `承認失敗: ${await res.text()}`).toBe(200)

    // ★ 最重要: partners.bank が更新されたか
    const { data: after } = await sb()
      .from('partners').select('bank').eq('id', partnerId).single()
    expect((after?.bank as typeof NEW_BANK | null)?.bank_name).toBe(NEW_BANK.bank_name)
    expect((after?.bank as typeof NEW_BANK | null)?.account_number).toBe(NEW_BANK.account_number)

    // 申請ステータスが approved になったか
    const { data: req } = await sb()
      .from('bank_change_requests').select('status').eq('id', requestId).single()
    expect(req?.status).toBe('approved')
  })
})

// ── 4. 管理者が却下すると partners.bank は変更されない ──────────────────
test.describe('M6B-4: 却下で partners.bank が変更されない', () => {
  test.use({ storageState: 'e2e/storageState/admin.json' })

  const ORIGINAL_BANK = {
    bank_name: '元の銀行', branch_name: '元の支店',
    account_type: '普通', account_number: '9999999', account_holder: 'モトノ ゼンラ',
  }

  let requestId: string
  let partnerId: string

  test.beforeAll(async () => {
    await cleanupBankRequests()
    const client = sb()
    const { data: partner } = await client
      .from('partners').select('id').eq('code', E2E.PARTNER_CODE).single()
    partnerId = partner!.id

    // 元の口座情報をセット
    await client.from('partners').update({ bank: ORIGINAL_BANK }).eq('id', partnerId)

    const { data: req } = await client
      .from('bank_change_requests')
      .insert({
        partner_id:  partnerId,
        before_bank: ORIGINAL_BANK,
        new_bank:    NEW_BANK,
        status:      'pending',
      })
      .select('id').single()
    requestId = req!.id
  })
  test.afterAll(async () => { await cleanupBankRequests() })

  test('却下後も partners.bank は元のままで変わらない', async ({ page }) => {
    // 却下理由なしは 400
    const bad = await page.request.patch(
      `/api/console/bank-change-requests/${requestId}`,
      { data: { action: 'reject' } },
    )
    expect(bad.status()).toBe(400)

    // 却下実行
    const res = await page.request.patch(
      `/api/console/bank-change-requests/${requestId}`,
      { data: { action: 'reject', reject_reason: 'テスト却下理由' } },
    )
    expect(res.status(), `却下失敗: ${await res.text()}`).toBe(200)

    // ★ 最重要: partners.bank が変わっていないこと
    const { data: after } = await sb()
      .from('partners').select('bank').eq('id', partnerId).single()
    expect((after?.bank as typeof ORIGINAL_BANK | null)?.bank_name).toBe(ORIGINAL_BANK.bank_name)
    expect((after?.bank as typeof ORIGINAL_BANK | null)?.account_number).toBe(ORIGINAL_BANK.account_number)

    // 申請ステータスが rejected になったか
    const { data: req } = await sb()
      .from('bank_change_requests').select('status, reject_reason').eq('id', requestId).single()
    expect(req?.status).toBe('rejected')
    expect(req?.reject_reason).toBe('テスト却下理由')
  })

  test('処理済み申請への再操作は 409', async ({ page }) => {
    const res = await page.request.patch(
      `/api/console/bank-change-requests/${requestId}`,
      { data: { action: 'approve' } },
    )
    expect(res.status()).toBe(409)
  })
})

// ── 5. 却下後に再申請できる ───────────────────────────────────────────────
test.describe('M6B-5: 却下後に再申請できる', () => {
  test.use({ storageState: 'e2e/storageState/partner.json' })

  test.beforeAll(async () => {
    await cleanupBankRequests()
    // 却下済みレコードを作成
    const client = sb()
    const { data: partner } = await client
      .from('partners').select('id').eq('code', E2E.PARTNER_CODE).single()
    await client.from('bank_change_requests').insert({
      partner_id:   partner!.id,
      new_bank:     NEW_BANK,
      status:       'rejected',
      reject_reason: '前回の却下',
    })
  })
  test.afterAll(async () => { await cleanupBankRequests() })

  test('却下済みがある状態で新規申請できる（201）', async ({ page }) => {
    const res = await page.request.post('/api/bank-change-requests', {
      data: NEW_BANK_2,
    })
    expect(res.status(), `再申請失敗: ${await res.text()}`).toBe(201)
  })
})
