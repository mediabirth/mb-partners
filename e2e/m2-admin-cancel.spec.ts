/**
 * M2-3: 管理者による案件取り消し・却下
 *
 * - 管理コンソールの案件ボードで案件を取り消せること
 * - 取り消し後、ボードから消えること
 * - ステータス変更（前後移動）ができること
 */
import { test, expect } from '@playwright/test'
import { E2E } from './test-constants'

test.use({ storageState: 'e2e/storageState/admin.json' })

test.describe('M2-3: 管理者 — 案件ボード操作', () => {
  test('案件ボードが表示される', async ({ page }) => {
    await page.goto('/console/deals')
    await expect(page.getByText('案件ボード')).toBeVisible()
    // 4列のカラムが表示されること
    await expect(page.getByText('受付')).toBeVisible()
    await expect(page.getByText('対応中')).toBeVisible()
    await expect(page.getByText('成約・確定')).toBeVisible()
    await expect(page.getByText('支払済')).toBeVisible()
  })

  test('案件カードをクリックすると詳細パネルが開く', async ({ page }) => {
    await page.goto('/console/deals')

    const dealCard = page.getByText(E2E.CUSTOMER_CANCEL)
    await expect(dealCard).toBeVisible()
    await dealCard.click()

    // 詳細パネルが開くこと
    await expect(page.getByText('ステータス変更')).toBeVisible()
    await expect(page.getByText('案件を取り消し')).toBeVisible()
  })

  test('ステータスを「受付 → 対応中」に進められる', async ({ page }) => {
    await page.goto('/console/deals')

    // 案件カードを開く（取消対象ではなく紹介テスト顧客を使う）
    const dealCard = page.getByText(E2E.CUSTOMER_CANCEL)
    await expect(dealCard).toBeVisible()
    await dealCard.click()

    // 「→ 対応中」ボタンが表示されること
    const advanceBtn = page.locator('button:has-text("対応中")')
    await expect(advanceBtn).toBeVisible()

    await advanceBtn.click()

    // トーストが表示されること
    await expect(page.getByText(/ステータスを「対応中」に変更しました/)).toBeVisible({ timeout: 6000 })
  })

  test('案件を取り消すとボードから消える', async ({ page }) => {
    await page.goto('/console/deals')

    // グローバルセットアップで作成した受付案件を取り消す
    // 注意: 前テストで対応中に移動したので、同じ案件は対応中にある可能性がある
    // そのため、案件名で検索して見つかったものを取り消す
    const dealCard = page.getByText(E2E.CUSTOMER_CANCEL).first()
    await expect(dealCard).toBeVisible({ timeout: 5000 })
    await dealCard.click()

    // 「案件を取り消し」ボタンをクリック（confirm ダイアログを承認）
    page.once('dialog', dialog => dialog.accept())
    await page.locator('button:has-text("案件を取り消し")').click()

    // トーストが表示されること
    await expect(page.getByText('案件を取り消しました')).toBeVisible({ timeout: 8000 })

    // ボードから案件が消えること
    await expect(page.getByText(E2E.CUSTOMER_CANCEL)).not.toBeVisible()
  })
})
