/**
 * M5B: 予約フロー
 *
 * 1. calcAvailableSlots ロジック — busy ブロックを正しく除外する
 * 2. /book/[partner_id] 予約UI フロー（availability/meetings API をモック）
 * 3. POST /api/meetings → meetings に保存 + パートナーに通知（createNotification）
 */
import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { createCipheriv, randomBytes } from 'crypto'
import { E2E } from './test-constants'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!

function sb() {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
}

function encryptToken(plain: string): string {
  const KEY = Buffer.from(process.env.GOOGLE_TOKEN_SECRET!, 'hex')
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', KEY, iv)
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, encrypted]).toString('base64')
}

// ── テスト用 calendar_links を準備 ──────────────────────────────────────────

let partnerId = ''

test.beforeAll(async () => {
  const client = sb()
  const { data: partner } = await client.from('partners').select('id').eq('code', E2E.PARTNER_CODE).single()
  if (!partner) throw new Error('partner not found')
  partnerId = partner.id

  // calendar_links に有効な設定を upsert
  const { error } = await client.from('calendar_links').upsert(
    {
      partner_id:   partner.id,
      google_email: 'partner@example.com',
      oauth_tokens: {
        access_token:  encryptToken('fake_access_token'),
        refresh_token: encryptToken('fake_refresh_token'),
        expires_at:    new Date(Date.now() + 3600_000).toISOString(),
      },
      active:      true,
      owner_name:  'E2Eパートナー',
      service_ids: [],
      availability: {
        days:           [1, 2, 3, 4, 5],
        start:          '09:00',
        end:            '11:00',
        slot_minutes:   60,
        buffer_minutes: 0,
      },
    },
    { onConflict: 'partner_id' },
  )
  if (error) throw new Error(`calendar_links upsert failed: ${error.message}`)
})

// ── 1. 空き枠ロジック単体テスト（Node.js 内で直接検証） ────────────────────

test.describe('M5B-1: calcAvailableSlots — busy ブロックを除外する', () => {

  test('平日に2スロット生成され、busyブロックと重なるスロットが除外される', async () => {
    // lib/google-calendar.ts の calcAvailableSlots と同じロジックをテスト
    // 月曜日 2026-06-15、09:00-11:00、60分スロット、バッファ0分
    // busyBlocks: 09:00-10:00 (UTC) = JST 18:00-19:00 → この日は別の日になるので…
    // 正しくUTCで計算: date=2026-06-15, JST09:00 = UTC00:00, JST11:00 = UTC02:00

    const date = '2026-06-15'  // 月曜日
    const avail = {
      days:           [1, 2, 3, 4, 5],
      start:          '09:00',
      end:            '11:00',
      slot_minutes:   60,
      buffer_minutes: 0,
    }

    // 2026-06-15 JST 09:00-10:00 = UTC 00:00-01:00
    const busyBlocks = [
      { start: '2026-06-14T15:00:00Z', end: '2026-06-14T16:00:00Z' },  // 干渉なし (別日)
    ]

    // inline implementation (同じロジック)
    const slots = calcAvailableSlots(date, avail, busyBlocks)
    expect(slots.length).toBe(2)
    // スロット1: JST 09:00-10:00 = UTC 00:00-01:00
    expect(new Date(slots[0].start).getUTCHours()).toBe(0)
    // スロット2: JST 10:00-11:00 = UTC 01:00-02:00
    expect(new Date(slots[1].start).getUTCHours()).toBe(1)
  })

  test('busyブロックと重なるスロットが除外される', async () => {
    const date = '2026-06-15'  // 月曜日
    const avail = {
      days:           [1, 2, 3, 4, 5],
      start:          '09:00',
      end:            '11:00',
      slot_minutes:   60,
      buffer_minutes: 0,
    }

    // 2026-06-15 JST 09:00-10:00 = UTC 2026-06-14T00:00Z - UTC 2026-06-14T01:00Z
    // Note: JST is UTC+9, so JST 09:00 on June 15 = UTC 00:00 on June 15
    const busyStart = new Date('2026-06-15T00:00:00Z').toISOString()
    const busyEnd   = new Date('2026-06-15T01:00:00Z').toISOString()

    const slots = calcAvailableSlots(date, avail, [{ start: busyStart, end: busyEnd }])
    // 09:00-10:00 は busy → 除外、10:00-11:00 のみ残る
    expect(slots.length).toBe(1)
    expect(new Date(slots[0].start).getUTCHours()).toBe(1)
  })

  test('受付外の曜日（日曜）はスロットなし', async () => {
    const date = '2026-06-14'  // 日曜日
    const avail = {
      days:           [1, 2, 3, 4, 5],
      start:          '09:00',
      end:            '11:00',
      slot_minutes:   60,
      buffer_minutes: 0,
    }
    const slots = calcAvailableSlots(date, avail, [])
    expect(slots.length).toBe(0)
  })
})

// ── calcAvailableSlots inline implementation ──────────────────────────────────
// (lib/google-calendar.ts の実装と同一 — @/ alias が Playwright から解決できないため)

type BusyBlock = { start: string; end: string }
type TimeSlot  = { start: string; end: string }
type Availability = {
  days: number[]; start: string; end: string; slot_minutes: number; buffer_minutes: number
}

function calcAvailableSlots(date: string, avail: Availability, busyBlocks: BusyBlock[]): TimeSlot[] {
  const [year, month, day] = date.split('-').map(Number)
  const jstOffset = 9 * 60

  const localDate = new Date(Date.UTC(year, month - 1, day))
  const weekday = new Date(localDate.getTime() + jstOffset * 60_000).getDay()
  if (!avail.days.includes(weekday)) return []

  const [sh, sm] = avail.start.split(':').map(Number)
  const [eh, em] = avail.end.split(':').map(Number)
  const dayStartUtc = new Date(Date.UTC(year, month - 1, day, sh, sm) - jstOffset * 60_000)
  const dayEndUtc   = new Date(Date.UTC(year, month - 1, day, eh, em) - jstOffset * 60_000)

  const slotMs   = avail.slot_minutes   * 60_000
  const bufferMs = avail.buffer_minutes * 60_000

  const slots: TimeSlot[] = []
  let cursor = dayStartUtc.getTime()

  while (cursor + slotMs <= dayEndUtc.getTime()) {
    const slotStart = cursor
    const slotEnd   = cursor + slotMs
    const blocked = busyBlocks.some(b => {
      const bs = new Date(b.start).getTime() - bufferMs
      const be = new Date(b.end).getTime()   + bufferMs
      return slotStart < be && slotEnd > bs
    })
    if (!blocked) {
      slots.push({ start: new Date(slotStart).toISOString(), end: new Date(slotEnd).toISOString() })
    }
    cursor += slotMs
  }
  return slots
}

// ── 2. 予約UI フロー（API モック使用） ────────────────────────────────────────

test.describe('M5B-2: /book/[partner_id] 予約フロー UI', () => {

  test('日付選択 → スロット選択 → フォーム入力 → 予約完了', async ({ page }) => {
    // /api/availability をモック（Google API を呼ばずにテスト）
    await page.route('/api/availability*', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          slots: [
            { start: '2026-06-15T00:00:00.000Z', end: '2026-06-15T01:00:00.000Z' },
            { start: '2026-06-15T01:00:00.000Z', end: '2026-06-15T02:00:00.000Z' },
          ],
        }),
      })
    })

    // /api/meetings をモック（DB 書き込みはM5B-3で別テスト）
    await page.route('/api/meetings', route => {
      route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ meeting_id: 'mock-meeting-id' }),
      })
    })

    await page.goto(`/book/${partnerId}`)

    // Step1: 日付一覧が表示される
    await expect(page.getByRole('heading', { name: 'ご予約' })).toBeVisible()

    // 最初の日付ボタンをクリック
    const dateBtn = page.locator('button').filter({ hasText: /\d+\/\d+/ }).first()
    await expect(dateBtn).toBeVisible({ timeout: 8000 })
    await dateBtn.click()

    // Step2: スロット一覧（モック: 2スロット）が表示される
    await expect(page.getByText('時間を選択')).toBeVisible()
    const slotBtns = page.locator('button').filter({ hasText: /\d+:\d+/ })
    await expect(slotBtns.first()).toBeVisible({ timeout: 8000 })
    await slotBtns.first().click()

    // Step3: フォーム入力
    await expect(page.getByText('お客様情報')).toBeVisible()
    await page.fill('input[placeholder*="山田"]', 'テスト太郎')
    await page.fill('input[type="email"]', 'test-client@example.com')

    await page.click('button:has-text("予約を確定する")')

    // Step4: 完了画面
    await expect(page.getByText('予約が完了しました')).toBeVisible({ timeout: 8000 })
  })
})

// ── 3. POST /api/meetings → DB保存 + 通知 ────────────────────────────────────

test.describe('M5B-3: POST /api/meetings → meetings保存 + 通知', () => {

  const clientName  = `E2Eクライアント_${Date.now()}`
  const clientEmail = 'e2e-client@example.com'
  const startAt     = '2026-07-01T00:00:00.000Z'  // JST 09:00
  const endAt       = '2026-07-01T01:00:00.000Z'  // JST 10:00

  test('予約が meetings テーブルに保存される', async ({ page }) => {
    // API を直接呼び出し（page.request を使用）
    const resp = await page.request.post('/api/meetings', {
      data: {
        partner_id:   partnerId,
        start_at:     startAt,
        end_at:       endAt,
        client_name:  clientName,
        client_email: clientEmail,
      },
    })

    // Google Calendar 呼び出しは失敗するが、meetings 保存は成功するはず
    expect(resp.status()).toBe(201)
    const body = await resp.json()
    expect(body.meeting_id).toBeTruthy()

    // DB に meeting レコードが保存されている
    const client = sb()
    const { data: meeting } = await client
      .from('meetings')
      .select('id, client_name, client_email, status')
      .eq('partner_id', partnerId)
      .eq('client_name', clientName)
      .single()

    expect(meeting).not.toBeNull()
    expect(meeting!.client_name).toBe(clientName)
    expect(meeting!.client_email).toBe(clientEmail)
    expect(meeting!.status).toBe('booked')
  })

  test('パートナーに予約通知が届く', async () => {
    const client = sb()

    // 直前のテストで作成した meeting に対応する notification を確認
    const { data: notif } = await client
      .from('notifications')
      .select('title, body, ref')
      .eq('partner_id', partnerId)
      .eq('title', '新しい予約が入りました')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    expect(notif).not.toBeNull()
    expect(notif!.body).toContain(clientName)
    expect((notif!.ref as any)?.type).toBe('meeting')
  })
})
