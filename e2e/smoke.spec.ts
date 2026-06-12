import { test, expect } from '@playwright/test'

// ============================================================
// M0 — 基盤
// ============================================================
test.describe('M0 基盤', () => {
  test('トップ(/) にアクセスすると /login にリダイレクトされる', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL('/login')
  })
})

// ============================================================
// M1 — 認証
// ============================================================
test.describe('M1 認証', () => {
  test('/login がパートナーログイン画面を表示する', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByText('Media Birth Partner Program')).toBeVisible()
    await expect(page.getByText('ログインリンクを送信')).toBeVisible()
    await expect(page.getByText('本プログラムは招待制です。')).toBeVisible()
  })

  test('/login のメール入力欄が使える', async ({ page }) => {
    await page.goto('/login')
    const input = page.locator('input[type="email"]')
    await expect(input).toBeVisible()
    await input.fill('test@example.com')
    await expect(input).toHaveValue('test@example.com')
  })

  test('/console/login が管理者ログイン画面を表示する', async ({ page }) => {
    await page.goto('/console/login')
    await expect(page.getByText('Console')).toBeVisible()
    await expect(page.getByText('次へ（2段階認証）')).toBeVisible()
    await expect(page.locator('input[type="email"]')).toBeVisible()
    await expect(page.locator('input[type="password"]')).toBeVisible()
  })

  test('未認証で /app にアクセスすると /login にリダイレクトされる', async ({ page }) => {
    await page.goto('/app')
    await expect(page).toHaveURL('/login')
  })

  test('未認証で /console にアクセスすると /console/login にリダイレクトされる', async ({ page }) => {
    await page.goto('/console')
    await expect(page).toHaveURL('/console/login')
  })
})
