import { test, expect } from '@playwright/test'

test('トップページが200を返し、疎通確認テキストが表示される', async ({ page }) => {
  const response = await page.goto('/')
  expect(response?.status()).toBe(200)
  await expect(page.getByText('MB Partners — Supabase 疎通確認')).toBeVisible()
  await expect(page.getByText('✓ 全テーブル接続OK')).toBeVisible()
})

test('deals が8件取得できている', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('deals (8件)')).toBeVisible()
})

test('services が5件取得できている', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('services (5件)')).toBeVisible()
})
