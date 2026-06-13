/**
 * M5A: カレンダー連携設定
 *
 * 1. パートナーが /app/calendar にアクセスできる（Google連携ボタン表示）
 * 2. 受付時間帯を設定して保存できる（PATCH /api/calendar）
 * 3. calendar_links に暗号化トークンが保存・復号できる（DB直接検証）
 * 4. GET /api/calendar が保存済みデータを返す
 */
import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'
import { E2E } from './test-constants'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!

function sb() {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
}

// ── トークン暗号化ヘルパー（lib/google-token.ts と同じアルゴリズム） ───────
const ALGORITHM = 'aes-256-gcm'

function encryptToken(plain: string): string {
  const KEY = Buffer.from(process.env.GOOGLE_TOKEN_SECRET!, 'hex')
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGORITHM, KEY, iv)
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, encrypted]).toString('base64')
}

function decryptToken(encoded: string): string {
  const KEY = Buffer.from(process.env.GOOGLE_TOKEN_SECRET!, 'hex')
  const buf = Buffer.from(encoded, 'base64')
  const iv  = buf.subarray(0, 12)
  const tag = buf.subarray(12, 28)
  const ciphertext = buf.subarray(28)
  const decipher = createDecipheriv(ALGORITHM, KEY, iv)
  decipher.setAuthTag(tag)
  return decipher.update(ciphertext) + decipher.final('utf8')
}

// ── 1. カレンダーページ表示 ───────────────────────────────────────────────────
test.describe('M5A-1: カレンダーページが表示される', () => {
  test.use({ storageState: 'e2e/storageState/partner.json' })

  test('Google連携ボタンが表示される', async ({ page }) => {
    // 前回実行の残留データを削除してから未連携状態を確認
    // meetings → calendar_links の順（FK制約）
    const client = sb()
    const { data: partner } = await client.from('partners').select('id').eq('code', E2E.PARTNER_CODE).single()
    if (partner) {
      await client.from('meetings').delete().eq('partner_id', partner.id)
      await client.from('calendar_links').delete().eq('partner_id', partner.id)
    }

    await page.goto('/app/calendar')
    await expect(page.getByRole('heading', { name: 'カレンダー連携', exact: true })).toBeVisible()
    await expect(page.getByText('Google と連携する')).toBeVisible()
  })
})

// ── 2. 受付時間帯を保存できる ────────────────────────────────────────────────
test.describe('M5A-2: 受付時間帯を設定して保存できる', () => {
  test.use({ storageState: 'e2e/storageState/partner.json' })

  // calendar_links レコードがない状態で PATCH → 404 / link がない場合は upsert がないので skip
  // ここでは API 直接呼び出しで calendar_links が存在する前提でテスト
  test.beforeAll(async () => {
    const client = sb()
    const { data: partner } = await client.from('partners').select('id').eq('code', E2E.PARTNER_CODE).single()
    if (!partner) throw new Error('partner not found')

    // テスト用 calendar_links を upsert（partner_id でユニーク）
    await client.from('calendar_links').upsert(
      {
        partner_id:   partner.id,
        google_email: 'test@example.com',
        oauth_tokens: {
          access_token:  encryptToken('fake_access_token'),
          refresh_token: encryptToken('fake_refresh_token'),
          expires_at:    new Date(Date.now() + 3600_000).toISOString(),
        },
        active:      true,
        owner_name:  'E2Eパートナー',
        service_ids: [],
        availability: null,
      },
      { onConflict: 'partner_id' },
    )
  })

  test('受付時間帯を設定して保存できる', async ({ page }) => {
    await page.goto('/app/calendar')

    // Google連携済みなのでメールアドレスが表示される
    await expect(page.getByText('連携済み')).toBeVisible({ timeout: 8000 })

    // 月〜金だけ残す（ページ上の曜日ボタン: 日月火水木金土）
    // デフォルトは [1,2,3,4,5] なので何も押さずに保存してみる
    await page.click('button:has-text("保存する")')
    await expect(page.getByText('保存しました')).toBeVisible({ timeout: 8000 })
  })

  test('保存後に GET /api/calendar で availability が返る', async ({ page }) => {
    const resp = await page.goto('/api/calendar')
    const json = await resp!.json()
    expect(json.link).not.toBeNull()
    // beforeAll で seeded + 保存操作後なので availability は non-null
    expect(json.link.availability).not.toBeNull()
    expect(json.link.availability.days).toEqual([1, 2, 3, 4, 5])
  })
})

// ── 3. 暗号化トークンの保存と復号 ────────────────────────────────────────────
test.describe('M5A-3: calendar_linksに暗号化トークンが保存・復号できる', () => {

  test('encryptToken → DB保存 → decryptToken で元の値に戻る', async () => {
    const client = sb()
    const { data: partner, error: partnerErr } = await client.from('partners').select('id').eq('code', E2E.PARTNER_CODE).single()
    expect(partnerErr).toBeNull()
    expect(partner).not.toBeNull()

    const FAKE_ACCESS  = 'test_access_token_12345'
    const FAKE_REFRESH = 'test_refresh_token_abcde'
    const expiresAt    = new Date(Date.now() + 3600_000).toISOString()

    const storedTokens = {
      access_token:  encryptToken(FAKE_ACCESS),
      refresh_token: encryptToken(FAKE_REFRESH),
      expires_at:    expiresAt,
    }

    // DB に保存
    const { error: upsertErr } = await client.from('calendar_links').upsert(
      {
        partner_id:   partner!.id,
        google_email: 'enc-test@example.com',
        oauth_tokens: storedTokens,
        active:       true,
        owner_name:   'E2Eパートナー',
        service_ids:  [],
      },
      { onConflict: 'partner_id' },
    )
    expect(upsertErr).toBeNull()

    // DB から取得
    const { data: link, error: fetchErr } = await client
      .from('calendar_links')
      .select('oauth_tokens')
      .eq('partner_id', partner!.id)
      .single()
    expect(fetchErr).toBeNull()
    expect(link!.oauth_tokens).not.toBeNull()

    // 復号して元の値と一致
    const retrieved = link!.oauth_tokens as typeof storedTokens
    expect(decryptToken(retrieved.access_token)).toBe(FAKE_ACCESS)
    expect(decryptToken(retrieved.refresh_token)).toBe(FAKE_REFRESH)
    expect(retrieved.expires_at).toBe(expiresAt)
  })
})
