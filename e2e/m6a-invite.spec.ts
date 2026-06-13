/**
 * M6A: 招待制アカウント作成ウィザード
 *
 * 1. 管理者が招待を作成できる（POST /api/console/invites）
 * 2. 招待ページが正しく表示される（有効なトークン）
 * 3. 招待受け入れ → auth.users/profiles/partners 作成 → /auth/magic → /app ログイン
 * 4. 使用済み招待トークンでの二重利用が拒否される
 * 5. 期限切れ招待が拒否される
 * 6. 存在しないトークンが 404 を返す
 */
import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'
import { E2E } from './test-constants'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!

function sb() {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

// ── ヘルパー: テスト用 invite を DB に直接作成 ────────────────────────────
async function createTestInvite(overrides: {
  email?: string
  expires_at?: string
  used_at?: string | null
} = {}) {
  const client = sb()
  const token = randomUUID()
  const { data, error } = await client.from('invites').insert({
    email:      overrides.email ?? E2E.INVITE_EMAIL,
    kind:       'partner',
    role:       'partner',
    name:       E2E.INVITE_NAME,
    token,
    expires_at: overrides.expires_at ?? new Date(Date.now() + 7 * 86400_000).toISOString(),
    used_at:    overrides.used_at ?? null,
  }).select('token').single()
  if (error) throw new Error(`invite insert failed: ${error.message}`)
  return token
}

// ── ヘルパー: 招待済みユーザーのクリーンアップ ──────────────────────────
async function cleanupInvitedUser() {
  const client = sb()
  // invites 削除
  await client.from('invites').delete().eq('email', E2E.INVITE_EMAIL)

  // profiles.email で検索してクリーンアップ（listUsers より確実）
  const { data: profile } = await client.from('profiles')
    .select('id').eq('email', E2E.INVITE_EMAIL).maybeSingle()
  if (profile) {
    const { data: partner } = await client.from('partners')
      .select('id').eq('profile_id', profile.id).maybeSingle()
    if (partner) {
      await client.from('meetings').delete().eq('partner_id', partner.id)
      await client.from('calendar_links').delete().eq('partner_id', partner.id)
      await client.from('notifications').delete().eq('partner_id', partner.id)
      await client.from('partners').delete().eq('id', partner.id)
    }
    await client.from('profiles').delete().eq('id', profile.id)
    try { await client.auth.admin.deleteUser(profile.id) } catch { /* ignore */ }
  }
}

// ── 1. 管理者による招待作成 API ───────────────────────────────────────────
test.describe('M6A-1: 管理者が招待を作成できる', () => {
  test.use({ storageState: 'e2e/storageState/admin.json' })

  test('POST /api/console/invites → invite_url が返る', async ({ page }) => {
    const email = `m6a-admin-test-${Date.now()}@mb-partners.test`
    const res = await page.request.post('/api/console/invites', {
      data: { email, name: 'テスト招待', role: 'partner' },
    })
    expect(res.status()).toBe(201)
    const body = await res.json()
    expect(body.invite_url).toContain('/invite/')
    expect(body.token).toBeTruthy()

    // クリーンアップ
    await sb().from('invites').delete().eq('email', email)
  })
})

// ── 2. 招待ページの表示 ───────────────────────────────────────────────────
test.describe('M6A-2: 招待ページが正しく表示される', () => {
  let token: string

  test.beforeAll(async () => {
    await cleanupInvitedUser()
    token = await createTestInvite()
  })

  test('有効なトークンでフォームが表示される', async ({ page }) => {
    await page.goto(`/invite/${token}`)
    await expect(page.getByText('招待を受け取りました')).toBeVisible()
    await expect(page.locator('input[type="email"]')).toHaveValue(E2E.INVITE_EMAIL)
    await expect(page.locator('#invite-name')).toHaveValue(E2E.INVITE_NAME)
  })
})

// ── 3. 招待受け入れ → アカウント作成 → /app ログイン ─────────────────────
test.describe('M6A-3: 招待受け入れ → /app まで正規ログイン', () => {
  let token: string

  test.beforeAll(async () => {
    await cleanupInvitedUser()
    token = await createTestInvite()
  })

  test.afterAll(async () => {
    await cleanupInvitedUser()
  })

  test('招待受け入れ → profiles/partners 作成 → /app ログイン', async ({ page }) => {
    const client = sb()

    // 1. accept API
    const res = await page.request.post('/api/invite/accept', {
      data: { token, name: E2E.INVITE_NAME },
    })
    expect(res.status(), `accept API failed: ${await res.text()}`).toBe(200)
    const body = await res.json()
    expect(body.action_link).toBeTruthy()
    expect(body.action_link).toContain('supabase')

    // 2. profiles が作成されているか（email で検索）
    const { data: profile } = await client.from('profiles')
      .select('id, name, role').eq('email', E2E.INVITE_EMAIL).single()
    expect(profile?.role).toBe('partner')
    expect(profile?.name).toBe(E2E.INVITE_NAME)

    // 3. partners が作成されているか
    const { data: partner } = await client.from('partners')
      .select('id, status').eq('profile_id', profile!.id).single()
    expect(partner?.status).toBe('active')

    // 4. invite.used_at が設定されているか
    const { data: invite } = await client.from('invites')
      .select('used_at').eq('token', token).single()
    expect(invite?.used_at).not.toBeNull()

    // 5. action_link 経由で /app にログインできるか
    //    （同じメールで新規リンクを生成）
    const { data: linkData } = await client.auth.admin.generateLink({
      type:    'magiclink',
      email:   E2E.INVITE_EMAIL,
      options: { redirectTo: `${process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000'}/auth/magic` },
    })
    const login_link = linkData?.properties?.action_link
    expect(login_link).toBeTruthy()

    await page.goto(login_link!)
    await page.waitForURL('**/app**', { timeout: 15000 })
    expect(page.url()).toContain('/app')
  })
})

// ── 4. 使用済みトークンの二重利用が拒否される ────────────────────────────
test.describe('M6A-4: 使用済み招待トークンが拒否される', () => {
  let usedToken: string

  test.beforeAll(async () => {
    // 使用済みトークンを作成
    const client = sb()
    usedToken = randomUUID()
    const { error } = await client.from('invites').insert({
      email:      `m6a-used-${Date.now()}@mb-partners.test`,
      kind:       'partner',
      role:       'partner',
      token:      usedToken,
      expires_at: new Date(Date.now() + 86400_000).toISOString(),
      used_at:    new Date().toISOString(),
    })
    if (error) throw new Error(`used invite insert failed: ${error.message}`)
  })

  test.afterAll(async () => {
    await sb().from('invites').delete().eq('token', usedToken)
  })

  test('使用済みトークンで accept すると 409', async ({ page }) => {
    const res = await page.request.post('/api/invite/accept', {
      data: { token: usedToken, name: 'テスト' },
    })
    expect(res.status()).toBe(409)
  })
})

// ── 5. 期限切れ招待が拒否される ────────────────────────────────────────
test.describe('M6A-5: 期限切れ招待が拒否される', () => {
  let expiredToken: string

  test.beforeAll(async () => {
    expiredToken = await createTestInvite({
      email:      `m6a-expired-${Date.now()}@mb-partners.test`,
      expires_at: new Date(Date.now() - 1000).toISOString(),
    })
  })

  test.afterAll(async () => {
    await sb().from('invites').delete().eq('token', expiredToken)
  })

  test('期限切れトークンでページを開くとエラー表示', async ({ page }) => {
    await page.goto(`/invite/${expiredToken}`)
    await expect(page.getByText('有効期限が切れています')).toBeVisible()
  })

  test('期限切れトークンで accept すると 410', async ({ page }) => {
    const res = await page.request.post('/api/invite/accept', {
      data: { token: expiredToken, name: 'テスト' },
    })
    expect(res.status()).toBe(410)
  })
})

// ── 6. 存在しないトークンが 404 ────────────────────────────────────────
test.describe('M6A-6: 存在しないトークンが拒否される', () => {
  const fakeToken = randomUUID()

  test('存在しないトークンでページを開くとエラー表示', async ({ page }) => {
    await page.goto(`/invite/${fakeToken}`)
    await expect(page.getByText('見つかりません')).toBeVisible()
  })

  test('存在しないトークンで accept すると 404', async ({ page }) => {
    const res = await page.request.post('/api/invite/accept', {
      data: { token: fakeToken, name: 'テスト' },
    })
    expect(res.status()).toBe(404)
  })
})
