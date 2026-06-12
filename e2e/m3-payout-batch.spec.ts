/**
 * M3: 月次締め・支払処理
 *
 * A. 金額整合: ¥80,000 → 源泉 −¥8,168 → 手取 ¥71,832
 * B. 個人/法人混在: 個人のみ源泉あり、法人は 0
 * C. 冪等性: 同月を 2 回締めても payout_items は重複しない
 * D. paid バッチは再締め不可
 * E. CSV エンドポイントが正しい金額を返す
 * F. 管理者が「支払済にする」→ deals が paid に移動
 * G. open バッチでは CSV リンクが無効化されている
 */
import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { E2E } from './test-constants'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!

function getTestData() {
  return JSON.parse(readFileSync(resolve(__dirname, '.test-data.json'), 'utf-8'))
}

function serviceClient() {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
}

// ── A/B/C/D: DB-level tests (no browser needed) ─────────────────────────────
test.describe('M3-A: 金額整合 (DB)', () => {
  test('close_month_batch が ¥80,000 → 源泉 ¥8,168 → 手取 ¥71,832 で締める', async () => {
    const sb = serviceClient()
    const testData = getTestData()

    // Clean up any previous batch for this month
    await sb.from('payout_items').delete().in('partner_id', [testData.partnerRecordId, testData.partner2RecordId])
    await sb.from('payout_batches').delete().eq('month', '2026-06-01')

    const { data, error } = await sb.rpc('close_month_batch', { target_month: E2E.BATCH_MONTH })
    expect(error).toBeNull()
    expect(data).toBeTruthy()

    const result = data as any
    expect(result.month).toBe(E2E.BATCH_MONTH)
    expect(result.partner_count).toBeGreaterThanOrEqual(1)

    // Verify individual partner item
    const { data: items } = await sb
      .from('payout_items')
      .select('gross, withholding, net, statement, partners(code, tax_type:tax_type)')
      .eq('batch_id', result.batch_id)

    const indItem = (items as any[])?.find(i => (i.partners as any)?.code === E2E.PARTNER_CODE)
    expect(indItem).toBeTruthy()
    expect(indItem.gross).toBe(E2E.REWARD_AMOUNT)           // ¥80,000
    expect(indItem.withholding).toBe(E2E.WITHHOLDING)       // ¥8,168
    expect(indItem.net).toBe(E2E.NET)                       // ¥71,832

    // Arithmetic sanity
    expect(indItem.withholding).toBe(Math.round(indItem.gross * 0.1021))
    expect(indItem.net).toBe(indItem.gross - indItem.withholding)
  })
})

test.describe('M3-B: 個人/法人 源泉比較 (DB)', () => {
  test('個人: 源泉あり、法人: 源泉 0', async () => {
    const sb = serviceClient()
    const testData = getTestData()

    // Batch may already exist from previous test — get or re-run
    let batchId: string
    const existing = await sb.from('payout_batches').select('id, status').eq('month', '2026-06-01').maybeSingle()
    if (!existing.data || existing.data.status === 'open') {
      // Re-run to ensure items are present
      const { data } = await sb.rpc('close_month_batch', { target_month: E2E.BATCH_MONTH })
      batchId = (data as any).batch_id
    } else {
      batchId = existing.data.id
    }

    const { data: items } = await sb
      .from('payout_items')
      .select('gross, withholding, net, partner_id, partners(code)')
      .eq('batch_id', batchId)

    const indItem  = (items as any[])?.find(i => (i.partners as any)?.code === E2E.PARTNER_CODE)
    const corpItem = (items as any[])?.find(i => (i.partners as any)?.code === E2E.PARTNER2_CODE)

    expect(indItem).toBeTruthy()
    expect(corpItem).toBeTruthy()

    // Individual: withholding applied
    expect(indItem.withholding).toBe(E2E.WITHHOLDING)  // 8168
    expect(indItem.net).toBe(E2E.NET)                  // 71832

    // Corporate: no withholding
    expect(corpItem.withholding).toBe(0)
    expect(corpItem.net).toBe(corpItem.gross)           // net = gross (no deduction)
    expect(corpItem.gross).toBe(E2E.REWARD_AMOUNT)     // ¥80,000
  })
})

test.describe('M3-C: 冪等性 (DB)', () => {
  test('同月を 2 回締めても payout_items が重複しない', async () => {
    const sb = serviceClient()

    // First close — record item count
    const { data: d1 } = await sb.rpc('close_month_batch', { target_month: E2E.BATCH_MONTH })
    const batchId = (d1 as any).batch_id
    const { data: items1 } = await sb.from('payout_items').select('id').eq('batch_id', batchId)
    const countAfterFirst = items1?.length ?? 0
    expect(countAfterFirst).toBeGreaterThanOrEqual(2) // at least individual + corporate

    // Second close — count must be identical (no duplication)
    const { data: d2, error } = await sb.rpc('close_month_batch', { target_month: E2E.BATCH_MONTH })
    expect(error).toBeNull()
    expect((d2 as any).batch_id).toBe(batchId) // same batch

    const { data: items2 } = await sb.from('payout_items').select('id').eq('batch_id', batchId)
    const countAfterSecond = items2?.length ?? 0

    // Idempotency: same count both times
    expect(countAfterSecond).toBe(countAfterFirst)
  })
})

test.describe('M3-D: paid バッチ保護 (DB)', () => {
  test('paid バッチを再締めしようとするとエラー', async () => {
    const sb = serviceClient()

    // Manually set batch to paid
    const { data: batch } = await sb.from('payout_batches').select('id').eq('month', '2026-06-01').single()
    await sb.from('payout_batches').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', batch!.id)

    // Try to close again — should fail
    const { data, error } = await sb.rpc('close_month_batch', { target_month: E2E.BATCH_MONTH })
    expect(error).not.toBeNull()
    expect(error!.message).toContain('already paid')

    // Restore to closed for subsequent tests
    await sb.from('payout_batches').update({ status: 'closed', paid_at: null }).eq('id', batch!.id)
  })
})

// ── E: CSV endpoint test ─────────────────────────────────────────────────────
test.describe('M3-E: CSV 出力', () => {
  test.use({ storageState: 'e2e/storageState/admin.json' })

  test('閉じたバッチの CSV が正しい金額を含む', async ({ page }) => {
    // Ensure batch is closed
    const sb = serviceClient()
    const existing = await sb.from('payout_batches').select('id, status').eq('month', '2026-06-01').maybeSingle()
    if (!existing.data) {
      await sb.rpc('close_month_batch', { target_month: E2E.BATCH_MONTH })
    } else if (existing.data.status === 'paid') {
      // Restore to closed
      await sb.from('payout_batches').update({ status: 'closed', paid_at: null }).eq('id', existing.data.id)
    }

    const res = await page.request.get(`/api/console/payouts/${E2E.BATCH_MONTH}/csv`)
    expect(res.status()).toBe(200)
    expect(res.headers()['content-type']).toContain('text/csv')

    const csv = await res.text()
    // Should contain individual partner's net amount (71832)
    expect(csv).toContain('71832')
    // Should contain partner codes
    expect(csv).toContain(E2E.PARTNER_CODE)
    expect(csv).toContain(E2E.PARTNER2_CODE)
    // Corporate partner has no withholding, gross = net = 80000
    // Individual partner: gross 80000, wh 8168, net 71832
    expect(csv).toContain('8168')
  })

  test('open バッチで CSV は 400 を返す', async ({ page }) => {
    // Create an open batch for a different month
    const sb = serviceClient()
    await sb.from('payout_batches').delete().eq('month', '2099-12-01')
    await sb.from('payout_batches').insert({ month: '2099-12-01', status: 'open' })

    const res = await page.request.get('/api/console/payouts/2099-12/csv')
    expect(res.status()).toBe(400)

    // Cleanup
    await sb.from('payout_batches').delete().eq('month', '2099-12-01')
  })
})

// ── F: Admin mark paid flow ──────────────────────────────────────────────────
test.describe('M3-F: 支払済反映 (UI)', () => {
  test.use({ storageState: 'e2e/storageState/admin.json' })

  test('支払管理ページが表示される', async ({ page }) => {
    await page.goto('/console/payouts')
    await expect(page.getByRole('heading', { name: '支払管理' })).toBeVisible()
  })

  test('閉じたバッチが表示され CSV ボタンが有効', async ({ page }) => {
    const sb = serviceClient()
    // Ensure batch is closed
    const existing = await sb.from('payout_batches').select('id, status').eq('month', '2026-06-01').maybeSingle()
    if (!existing.data) {
      await sb.rpc('close_month_batch', { target_month: E2E.BATCH_MONTH })
    } else if (existing.data.status !== 'closed') {
      await sb.from('payout_batches').update({ status: 'closed', paid_at: null }).eq('id', existing.data.id)
    }

    await page.goto('/console/payouts')
    await expect(page.getByText('2026年06月')).toBeVisible({ timeout: 8000 })
    await expect(page.getByText('締め済')).toBeVisible()

    // CSV button should be enabled (has href)
    const csvLink = page.locator('a:has-text("CSV出力")').first()
    await expect(csvLink).toBeVisible()
    const href = await csvLink.getAttribute('href')
    expect(href).toBeTruthy()
    expect(href).toContain('/api/console/payouts/2026-06/csv')
  })

  test('「支払済にする」で deals が paid に移動する', async ({ page }) => {
    const sb = serviceClient()

    // Ensure batch is closed
    const existing = await sb.from('payout_batches').select('id, status').eq('month', '2026-06-01').maybeSingle()
    if (!existing.data) {
      await sb.rpc('close_month_batch', { target_month: E2E.BATCH_MONTH })
    } else if (existing.data.status !== 'closed') {
      await sb.from('payout_batches').update({ status: 'closed', paid_at: null }).eq('id', existing.data.id)
    }

    await page.goto('/console/payouts')
    await expect(page.getByText('2026年06月')).toBeVisible({ timeout: 8000 })

    // Accept confirm dialog
    page.once('dialog', dialog => dialog.accept())
    await page.locator('button:has-text("支払済にする")').click()

    // Toast
    await expect(page.getByText('支払済に変更しました')).toBeVisible({ timeout: 8000 })

    // Badge should update to 支払済
    await expect(page.getByText('支払済').first()).toBeVisible()

    // DB: deals should now be 'paid'
    const { data: deals } = await sb
      .from('deals')
      .select('status')
      .eq('customer_name', E2E.CUSTOMER_PAYOUT)
    expect(deals?.[0]?.status).toBe('paid')
  })
})

// ── G: UI lock for open batch ────────────────────────────────────────────────
test.describe('M3-G: open バッチの CSV ロック (UI)', () => {
  test.use({ storageState: 'e2e/storageState/admin.json' })

  test('open バッチの CSV ボタンは無効化されている', async ({ page }) => {
    const sb = serviceClient()
    // Create open batch
    await sb.from('payout_batches').delete().eq('month', '2098-11-01')
    await sb.from('payout_batches').insert({ month: '2098-11-01', status: 'open' })

    await page.goto('/console/payouts')
    await expect(page.getByText('2098年11月')).toBeVisible({ timeout: 8000 })

    // CSV button for open batch should have pointer-events:none
    const csvBtn = page.locator('a:has-text("CSV出力")').first()
    const pe = await csvBtn.evaluate(el => getComputedStyle(el).pointerEvents)
    expect(pe).toBe('none')

    // Cleanup
    await sb.from('payout_batches').delete().eq('month', '2098-11-01')
  })
})
