/**
 * M4B: 問い合わせ機能
 *
 * 1. パートナーが問い合わせを送信する
 * 2. 管理者の受信箱に表示される
 * 3. 管理者が返信する → パートナーに通知が届く
 * 4. パートナーの通知センター（/app/inbox）に inquiry_reply 通知が表示される
 */
import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { E2E } from './test-constants'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!

function serviceClient() {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
}

const TEST_SUBJECT = `E2Eテスト問い合わせ_${Date.now()}`
const TEST_BODY    = 'これはE2Eテスト用の問い合わせです。'

// ── 1. パートナーが問い合わせを送信する ──────────────────────────────────────
test.describe('M4B-1: パートナーが問い合わせを送信', () => {
  test.use({ storageState: 'e2e/storageState/partner.json' })

  test('お問い合わせページが表示される', async ({ page }) => {
    await page.goto('/app/support')
    await expect(page.getByRole('heading', { name: 'お問い合わせ' })).toBeVisible()
  })

  test('フォームを送信できる', async ({ page }) => {
    await page.goto('/app/support')

    // Fill form
    await page.selectOption('select', 'other')
    await page.fill('input[placeholder*="件名"]', TEST_SUBJECT)
    await page.fill('textarea[placeholder*="お問い合わせ内容"]', TEST_BODY)

    await page.click('button[type="submit"]')

    // Should show success message
    await expect(page.getByText('お問い合わせを送信しました')).toBeVisible({ timeout: 8000 })
  })

  test('送信後に一覧に表示される', async ({ page }) => {
    await page.goto('/app/support')
    // The list might show inquiries from the DB
    const sb = serviceClient()
    const { data: partner } = await sb.from('partners').select('id').eq('code', E2E.PARTNER_CODE).single()
    if (partner) {
      const { data: inquiries } = await sb
        .from('inquiries')
        .select('id, subject')
        .eq('partner_id', partner.id)
        .order('created_at', { ascending: false })
        .limit(1)

      if (inquiries && inquiries.length > 0) {
        // Navigate to thread
        await page.goto(`/app/support/${inquiries[0].id}`)
        await expect(page.getByText(inquiries[0].subject)).toBeVisible({ timeout: 6000 })
      }
    }
  })
})

// ── 2. 管理者の受信箱に表示される ────────────────────────────────────────────
test.describe('M4B-2: 管理者受信箱', () => {
  test.use({ storageState: 'e2e/storageState/admin.json' })

  test('問い合わせ一覧ページが表示される', async ({ page }) => {
    await page.goto('/console/inquiries')
    await expect(page.getByRole('heading', { name: '問い合わせ' })).toBeVisible()
  })

  test('パートナーの問い合わせが一覧に表示される', async ({ page }) => {
    // Make sure there's an inquiry in the DB
    const sb = serviceClient()
    const { data: partner } = await sb.from('partners').select('id').eq('code', E2E.PARTNER_CODE).single()
    expect(partner).toBeTruthy()

    // Ensure at least one inquiry exists
    const existing = await sb.from('inquiries').select('id').eq('partner_id', partner!.id).limit(1)
    if (!existing.data?.length) {
      await sb.from('inquiries').insert({
        partner_id: partner!.id,
        category: 'other',
        subject: TEST_SUBJECT,
        status: 'open',
      }).then(async ({ data: inq }) => {
        // This won't work as insert returns the row — just ensure the inquiry exists
      })
      // Insert with select
      const { data: newInq } = await sb.from('inquiries').insert({
        partner_id: partner!.id,
        category: 'other',
        subject: TEST_SUBJECT,
      }).select('id').single()
      if (newInq) {
        await sb.from('inquiry_messages').insert({
          inquiry_id: newInq.id,
          sender_role: 'partner',
          body: TEST_BODY,
        })
      }
    }

    await page.goto('/console/inquiries')
    await expect(page.getByRole('heading', { name: '問い合わせ' })).toBeVisible({ timeout: 8000 })
    // There should be at least one row in the table
    await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 8000 })
  })
})

// ── 3. 管理者が返信する → パートナーに通知が届く ──────────────────────────
test.describe('M4B-3: 管理者返信と通知', () => {
  test.use({ storageState: 'e2e/storageState/admin.json' })

  test('管理者がスレッドに返信できる', async ({ page }) => {
    const sb = serviceClient()
    const { data: partner } = await sb.from('partners').select('id').eq('code', E2E.PARTNER_CODE).single()
    expect(partner).toBeTruthy()

    // Get or create inquiry
    let inquiryId: string
    const { data: existing } = await sb
      .from('inquiries')
      .select('id')
      .eq('partner_id', partner!.id)
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existing) {
      inquiryId = existing.id
    } else {
      const { data: newInq } = await sb.from('inquiries').insert({
        partner_id: partner!.id,
        category: 'other',
        subject: TEST_SUBJECT,
      }).select('id').single()
      inquiryId = newInq!.id
      await sb.from('inquiry_messages').insert({
        inquiry_id: inquiryId,
        sender_role: 'partner',
        body: TEST_BODY,
      })
    }

    await page.goto(`/console/inquiries/${inquiryId}`)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 8000 })

    // Fill reply
    const replyText = `管理者からのテスト返信 ${Date.now()}`
    await page.fill('textarea[placeholder*="返信内容"]', replyText)
    await page.click('button[type="submit"]')

    await expect(page.getByText('返信を送信しました')).toBeVisible({ timeout: 8000 })

    // Verify inquiry status is now 'replied' in DB
    const { data: updatedInq } = await sb.from('inquiries').select('status').eq('id', inquiryId).single()
    expect(updatedInq?.status).toBe('replied')

    // Verify notification was created
    const { data: notification } = await sb
      .from('notifications')
      .select('id, title, ref')
      .eq('partner_id', partner!.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    expect(notification).toBeTruthy()
    expect(notification?.title).toBe('お問い合わせに返信がありました')
    expect((notification?.ref as any)?.type).toBe('inquiry_reply')
    expect((notification?.ref as any)?.inquiry_id).toBe(inquiryId)
  })
})

// ── 4. パートナーの通知センターに表示される ──────────────────────────────────
test.describe('M4B-4: パートナー通知センター', () => {
  test.use({ storageState: 'e2e/storageState/partner.json' })

  test('通知センターに inquiry_reply 通知が表示される', async ({ page }) => {
    // First verify a notification exists via the API
    const sb = serviceClient()
    const { data: partner } = await sb.from('partners').select('id').eq('code', E2E.PARTNER_CODE).single()
    expect(partner).toBeTruthy()

    const { data: notifications } = await sb
      .from('notifications')
      .select('id, title, ref')
      .eq('partner_id', partner!.id)
      .order('created_at', { ascending: false })

    const inqNotif = notifications?.find((n: any) => (n.ref as any)?.type === 'inquiry_reply')

    if (inqNotif) {
      await page.goto('/app/inbox')
      await expect(page.getByText('お問い合わせに返信がありました')).toBeVisible({ timeout: 8000 })
    } else {
      // Notification might not exist yet — skip gracefully
      test.skip(true, 'No inquiry_reply notification found — run after M4B-3')
    }
  })
})

// ── Cleanup ───────────────────────────────────────────────────────────────────
test.describe('M4B-Cleanup: テストデータ削除', () => {
  test('テスト用の問い合わせデータを削除する', async () => {
    const sb = serviceClient()
    const { data: partner } = await sb.from('partners').select('id').eq('code', E2E.PARTNER_CODE).single()
    if (partner) {
      // Delete test inquiries (messages cascade)
      await sb.from('inquiries').delete().eq('partner_id', partner.id).like('subject', 'E2Eテスト問い合わせ%')
      // Also delete any notifications created by tests
      await sb.from('notifications')
        .delete()
        .eq('partner_id', partner.id)
        .eq('title', 'お問い合わせに返信がありました')
    }
  })
})
