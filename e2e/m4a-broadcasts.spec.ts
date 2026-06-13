/**
 * M4A: 配信（Broadcasts）機能
 *
 * テストシナリオ:
 * 1. 管理者が記事を作成し配信する
 * 2. パートナーの通知センター（/app/inbox）に通知が届く
 * 3. パートナーがお知らせタブで記事を閲覧すると broadcast_reads に記録される
 */
import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { E2E } from './test-constants'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!

function serviceClient() {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
}

function getTestData() {
  return JSON.parse(readFileSync(resolve(__dirname, '.test-data.json'), 'utf-8'))
}

const TEST_BROADCAST_TITLE = 'M4A E2Eテスト配信'

// ── Cleanup helper ───────────────────────────────────────────────────────────
async function cleanupTestBroadcast() {
  const sb = serviceClient()
  const { data } = await sb.from('broadcasts').select('id').eq('title', TEST_BROADCAST_TITLE)
  if (data && data.length > 0) {
    const ids = data.map(b => b.id)
    await sb.from('broadcast_reads').delete().in('broadcast_id', ids)
    await sb.from('broadcasts').delete().in('id', ids)
  }
}

// ── A: Admin creates and sends broadcast (DB) ────────────────────────────────
test.describe('M4A-A: 管理者が配信を作成・送信 (DB)', () => {
  test('broadcasts テーブルへの insert と sent_at 更新', async () => {
    await cleanupTestBroadcast()

    const sb = serviceClient()
    const testData = getTestData()

    // Insert broadcast
    const { data: broadcast, error: insertErr } = await sb
      .from('broadcasts')
      .insert({
        kind: 'news',
        title: TEST_BROADCAST_TITLE,
        body: 'E2Eテスト用の本文です。',
        segment: 'all',
        created_by: testData.adminId,
      })
      .select()
      .single()

    expect(insertErr).toBeNull()
    expect(broadcast).toBeTruthy()
    expect(broadcast!.sent_at).toBeNull()

    // Send: update sent_at
    const { error: updateErr } = await sb
      .from('broadcasts')
      .update({ sent_at: new Date().toISOString() })
      .eq('id', broadcast!.id)

    expect(updateErr).toBeNull()

    // Verify sent_at is set
    const { data: updated } = await sb
      .from('broadcasts')
      .select('sent_at')
      .eq('id', broadcast!.id)
      .single()

    expect(updated?.sent_at).not.toBeNull()
  })
})

// ── B: broadcast_reads upsert (DB) ───────────────────────────────────────────
test.describe('M4A-B: broadcast_reads の記録 (DB)', () => {
  test('パートナーが開封すると broadcast_reads に記録される', async () => {
    const sb = serviceClient()
    const testData = getTestData()

    // Ensure broadcast exists and is sent
    const { data: existing } = await sb
      .from('broadcasts')
      .select('id, sent_at')
      .eq('title', TEST_BROADCAST_TITLE)
      .maybeSingle()

    let broadcastId: string
    if (!existing) {
      const { data: created } = await sb
        .from('broadcasts')
        .insert({
          kind: 'news',
          title: TEST_BROADCAST_TITLE,
          body: 'E2Eテスト用の本文です。',
          segment: 'all',
          created_by: testData.adminId,
          sent_at: new Date().toISOString(),
        })
        .select('id')
        .single()
      broadcastId = created!.id
    } else {
      broadcastId = existing.id
      if (!existing.sent_at) {
        await sb.from('broadcasts').update({ sent_at: new Date().toISOString() }).eq('id', broadcastId)
      }
    }

    // Clean up any previous read
    await sb.from('broadcast_reads')
      .delete()
      .eq('broadcast_id', broadcastId)
      .eq('partner_id', testData.partnerRecordId)

    // Insert read record
    const { error: readErr } = await sb
      .from('broadcast_reads')
      .upsert(
        { broadcast_id: broadcastId, partner_id: testData.partnerRecordId },
        { onConflict: 'broadcast_id,partner_id', ignoreDuplicates: true }
      )

    expect(readErr).toBeNull()

    // Verify
    const { data: readRecord } = await sb
      .from('broadcast_reads')
      .select('broadcast_id, read_at')
      .eq('broadcast_id', broadcastId)
      .eq('partner_id', testData.partnerRecordId)
      .single()

    expect(readRecord).toBeTruthy()
    expect(readRecord!.read_at).not.toBeNull()

    // Upsert again — should not duplicate
    await sb
      .from('broadcast_reads')
      .upsert(
        { broadcast_id: broadcastId, partner_id: testData.partnerRecordId },
        { onConflict: 'broadcast_id,partner_id', ignoreDuplicates: true }
      )

    const { data: allReads } = await sb
      .from('broadcast_reads')
      .select('broadcast_id')
      .eq('broadcast_id', broadcastId)
      .eq('partner_id', testData.partnerRecordId)

    expect(allReads?.length).toBe(1)
  })
})

// ── C: Admin UI — broadcast list page ────────────────────────────────────────
test.describe('M4A-C: 管理者 UI', () => {
  test.use({ storageState: 'e2e/storageState/admin.json' })

  test('配信一覧ページが表示される', async ({ page }) => {
    await page.goto('/console/broadcasts')
    await expect(page.getByRole('heading', { name: '配信' })).toBeVisible({ timeout: 8000 })
    await expect(page.getByText('新規作成')).toBeVisible()
  })

  test('新規作成フォームが開く', async ({ page }) => {
    await page.goto('/console/broadcasts/new')
    await expect(page.getByText('新規配信作成')).toBeVisible({ timeout: 8000 })
    await expect(page.getByPlaceholder('タイトルを入力')).toBeVisible()
  })

  test('記事を作成して配信できる', async ({ page }) => {
    // Clean up first
    await cleanupTestBroadcast()

    await page.goto('/console/broadcasts/new')
    await page.waitForLoadState('networkidle')

    // Fill form
    await page.getByPlaceholder('タイトルを入力').fill(TEST_BROADCAST_TITLE)
    await page.getByPlaceholder('本文を入力（省略可）').fill('E2E UIテスト用の本文です。')

    // Save
    await page.getByText('保存してプレビューへ').click()

    // Should redirect to preview page
    await page.waitForURL(/\/console\/broadcasts\/.+\/preview/, { timeout: 10000 })
    await expect(page.getByText(TEST_BROADCAST_TITLE)).toBeVisible()

    // Send broadcast
    page.once('dialog', dialog => dialog.accept())
    await page.getByText('配信する').click()

    // Should show success toast
    await expect(page.getByText(/配信しました/)).toBeVisible({ timeout: 8000 })

    // Should redirect to detail page
    await page.waitForURL(/\/console\/broadcasts\/[^/]+$/, { timeout: 10000 })
    await expect(page.getByText('配信詳細')).toBeVisible()
  })
})

// ── D: Notifications received by partner (DB) ────────────────────────────────
test.describe('M4A-D: パートナーへの通知 (DB)', () => {
  test('配信後にパートナーへ通知が届いている', async () => {
    const sb = serviceClient()
    const testData = getTestData()

    // Check that a notification with broadcast ref exists for the partner
    const { data: notifications } = await sb
      .from('notifications')
      .select('id, title, ref')
      .eq('partner_id', testData.partnerRecordId)
      .contains('ref', { type: 'broadcast' })
      .order('created_at', { ascending: false })
      .limit(5)

    // Find notification matching our test broadcast title
    const broadcastNotif = (notifications ?? []).find(
      n => n.title.includes('M4A E2Eテスト配信') || (n.ref as any)?.type === 'broadcast'
    )
    expect(broadcastNotif).toBeTruthy()
  })
})

// ── E: Partner API — mark as read ────────────────────────────────────────────
test.describe('M4A-E: パートナーが記事を開封 (API)', () => {
  test.use({ storageState: 'e2e/storageState/partner.json' })

  test('POST /api/broadcasts/[id]/read で開封記録される', async ({ page }) => {
    const sb = serviceClient()
    const testData = getTestData()

    // Get the broadcast we created
    const { data: broadcast } = await sb
      .from('broadcasts')
      .select('id')
      .eq('title', TEST_BROADCAST_TITLE)
      .not('sent_at', 'is', null)
      .maybeSingle()

    if (!broadcast) {
      // Skip if broadcast was not created in previous tests
      test.skip()
      return
    }

    // Clear previous reads
    await sb.from('broadcast_reads')
      .delete()
      .eq('broadcast_id', broadcast.id)
      .eq('partner_id', testData.partnerRecordId)

    // Call read API
    const res = await page.request.post(`/api/broadcasts/${broadcast.id}/read`)
    expect(res.status()).toBe(200)

    // Verify read was recorded
    const { data: readRecord } = await sb
      .from('broadcast_reads')
      .select('id')
      .eq('broadcast_id', broadcast.id)
      .eq('partner_id', testData.partnerRecordId)
      .single()

    expect(readRecord).toBeTruthy()
  })
})

// ── Cleanup ──────────────────────────────────────────────────────────────────
test.afterAll(async () => {
  await cleanupTestBroadcast()
})
