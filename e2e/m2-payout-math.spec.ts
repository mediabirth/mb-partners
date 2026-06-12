/**
 * M2-2: 報酬・源泉計算整合性
 *
 * 案件が成約・確定まで動いたとき:
 *   報酬 ¥80,000 → 源泉 −¥8,168 → 手取 ¥71,832
 *
 * 数値の根拠:
 *   withholding = Math.round(80000 * 0.1021) = Math.round(8168) = 8168
 *   net         = 80000 - 8168 = 71832
 */
import { test, expect } from '@playwright/test'
import { E2E } from './test-constants'

// 数値整合性の事前確認(純粋ロジックチェック)
test('Math: ¥80,000 × 10.21% 源泉 = ¥8,168 → 手取 ¥71,832', () => {
  const gross       = E2E.REWARD_AMOUNT
  const withholding = Math.round(gross * 0.1021)
  const net         = gross - withholding

  expect(withholding).toBe(E2E.WITHHOLDING) // 8168
  expect(net).toBe(E2E.NET)                 // 71832
})

test.describe('M2-2: パートナー報酬ページの表示', () => {
  test.use({ storageState: 'e2e/storageState/partner.json' })

  test('報酬ページが表示される', async ({ page }) => {
    await page.goto('/app/rewards')
    await expect(page.getByText('月次明細')).toBeVisible()
  })

  test('2026年06月の確定案件が表示される', async ({ page }) => {
    await page.goto('/app/rewards')

    // アコーディオンに月が表示されること
    await expect(page.getByText('2026年06月')).toBeVisible()
    await expect(page.getByText(E2E.CUSTOMER_PAYOUT)).toBeVisible()
  })

  test('¥80,000 → 源泉 ¥8,168 → 手取 ¥71,832 の整合', async ({ page }) => {
    await page.goto('/app/rewards')

    // 案件の報酬額 ¥80,000
    await expect(page.getByText('¥80,000').first()).toBeVisible()

    // 源泉所得税の行が表示されること
    await expect(page.getByText('源泉所得税(10.21%)')).toBeVisible()

    // 源泉額 ¥8,168
    await expect(page.locator(':text("8,168")')).toBeVisible()

    // 手取(net) ¥71,832 がアコーディオンヘッダに表示されること
    await expect(page.locator(':text("71,832")')).toBeVisible()
  })

  test('支払前（振込予定）ステータスが正しい', async ({ page }) => {
    await page.goto('/app/rewards')
    // status=confirmed なので「振込予定」
    await expect(page.getByText(/振込予定/)).toBeVisible()
  })
})
