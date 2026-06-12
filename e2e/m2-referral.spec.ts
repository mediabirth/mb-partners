/**
 * M2-1: 紹介リンク経由フロー
 *
 * 1. /r/[token] でランディングページが表示される
 * 2. フォーム送信 → 成功画面
 * 3. DB に case が「受付」で作成、reward_snapshot が正しい
 * 4. 管理コンソールの「受付」列に案件が表示される
 */
import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { E2E } from './test-constants'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!

// ─── パブリックページ（認証不要）─────────────────────────────────────────────
test.describe('M2-1-A: 紹介ランディングページ', () => {
  test('サービス情報とフォームが表示される', async ({ page }) => {
    await page.goto(`/r/${E2E.REFERRAL_TOKEN}`)
    await expect(page.getByText('ご紹介の登録')).toBeVisible()
    await expect(page.getByText(E2E.SERVICE_NAME)).toBeVisible()
    await expect(page.locator('input[placeholder="山田 太郎"]')).toBeVisible()
    await expect(page.locator('#consent')).toBeVisible()
  })

  test('存在しないトークンは「リンクが見つかりません」を表示', async ({ page }) => {
    await page.goto('/r/nonexistenttoken999')
    await expect(page.getByText('リンクが見つかりません')).toBeVisible()
  })

  test('同意なしで送信ボタンが無効化されている', async ({ page }) => {
    await page.goto(`/r/${E2E.REFERRAL_TOKEN}`)
    await page.fill('input[placeholder="山田 太郎"]', 'テスト')
    // consent not checked — button should be disabled
    await expect(page.locator('button[type="submit"]')).toBeDisabled()
  })

  test('フォーム送信 → 成功画面 + DB に案件が生成される', async ({ page }) => {
    await page.goto(`/r/${E2E.REFERRAL_TOKEN}`)
    await expect(page.getByText('ご紹介の登録')).toBeVisible()

    // フォーム入力
    await page.fill('input[placeholder="山田 太郎"]', E2E.CUSTOMER_REFERRAL)
    await page.fill('input[placeholder="090-XXXX-XXXX"]', '080-0000-1234')
    await page.check('#consent')

    // 送信
    await page.click('button[type="submit"]')

    // 成功画面確認
    await expect(page.getByText('送信しました')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('担当者よりご連絡いたします。')).toBeVisible()

    // DB 検証: 案件が作成されていること
    const service = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data: deal } = await service
      .from('deals')
      .select('id, status, channel, source, amount, consent, reward_snapshot, partners(code)')
      .eq('customer_name', E2E.CUSTOMER_REFERRAL)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    expect(deal).toBeTruthy()
    expect(deal!.status).toBe('received')
    expect(deal!.channel).toBe('referral')
    expect(deal!.consent).toBe(true)
    expect(deal!.amount).toBe(E2E.REWARD_AMOUNT)

    // reward_snapshot にメニューの報酬額が保存されていること
    expect(deal!.reward_snapshot).toBeTruthy()
    expect((deal!.reward_snapshot as any)?.ref_value).toBe(E2E.REWARD_AMOUNT)
    expect((deal!.reward_snapshot as any)?.ref_type).toBe('fixed')

    // 正しいパートナーに紐付いていること
    expect((deal!.partners as any)?.code).toBe(E2E.PARTNER_CODE)
  })
})

// ─── 管理コンソール検証（管理者認証が必要）────────────────────────────────────
test.describe('M2-1-B: 管理コンソールで受付列に表示', () => {
  test.use({ storageState: 'e2e/storageState/admin.json' })

  test('案件ボードの「受付」列に案件が表示される', async ({ page }) => {
    await page.goto('/console/deals')
    await expect(page.getByText('案件ボード')).toBeVisible()

    // 紹介リンク経由で作成された案件が受付列に存在すること
    const dealCard = page.getByText(E2E.CUSTOMER_REFERRAL)
    await expect(dealCard).toBeVisible({ timeout: 8000 })

    // カードをクリックして詳細を開く
    await dealCard.click()

    // 詳細パネルにパートナーコードが表示されること
    await expect(page.getByText(E2E.PARTNER_CODE)).toBeVisible()
  })
})
