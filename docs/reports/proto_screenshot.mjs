/**
 * Playwright full-page screenshot script for HTML prototypes (file://)
 * APP v12 + Console v9 + Account v2
 * Usage: node docs/reports/proto_screenshot.mjs
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir = dirname(fileURLToPath(import.meta.url))
const DOCS  = resolve(__dir, '../../..', 'docs')
const OUT   = resolve(__dir, 'proto_screens')
mkdirSync(OUT, { recursive: true })

const APP_HTML     = `file://${DOCS}/MB_Partners_プロトタイプ_v12_final.html`
const CONSOLE_HTML = `file://${DOCS}/MB_Partners_管理コンソール_v9_final.html`
const ACCOUNT_HTML = `file://${DOCS}/MB_Partners_アカウント作成_v2_final.html`

const browser = await chromium.launch({ headless: true })

async function shot(page, name) {
  await page.waitForTimeout(400)
  await page.screenshot({ path: resolve(OUT, name), fullPage: true })
  console.log('  ✓', name)
}

// helper: evaluate and ignore errors
async function ev(page, fn) {
  try { await page.evaluate(fn) } catch (e) { console.log('  ! eval error:', e.message.split('\n')[0]) }
}

// ── APP (v12) ────────────────────────────────────────────────────────────────
console.log('\n[APP v12]')
{
  const ctx  = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await ctx.newPage()
  await page.goto(APP_HTML)
  await page.waitForLoadState('domcontentloaded')

  // ログイン画面
  await shot(page, 'proto_app_login.png')

  // ログイン → ホーム (login() is a function declaration — lives on window)
  await ev(page, () => login())
  await shot(page, 'proto_app_home.png')

  // 案件一覧
  await ev(page, () => go('cases'))
  await shot(page, 'proto_app_cases.png')

  // 案件詳細 (id=1 is hardcoded in prototype data)
  await ev(page, () => { detail(1); go('detail') })
  await shot(page, 'proto_app_case_detail.png')

  // 報酬
  await ev(page, () => go('rewards'))
  await shot(page, 'proto_app_rewards.png')

  // 明細
  try {
    await ev(page, () => openDoc('ref'))
  } catch {
    await ev(page, () => go('doc'))
  }
  await shot(page, 'proto_app_rewards_doc.png')

  // 紹介フロー Step1: サービス選択
  await ev(page, () => go('refer'))
  await shot(page, 'proto_app_refer_step1.png')

  // Step2: 関わり方の選択 — selSvc('moom') → go('level')
  await ev(page, () => selSvc('moom'))
  await shot(page, 'proto_app_refer_step2_level.png')

  // Step3a: つなぐだけ (紹介リンク)
  await ev(page, () => goRef())
  await shot(page, 'proto_app_refer_step3a_routes.png')

  // Step3b: フロンティア/営業
  await ev(page, () => go('level'))
  await ev(page, () => goFT())
  await shot(page, 'proto_app_refer_step3b_ft.png')

  // フロンティア入力フォーム全体
  await ev(page, () => go('ft'))
  await shot(page, 'proto_app_refer_ft_form.png')

  // サービスガイド
  await ev(page, () => go('guide'))
  await shot(page, 'proto_app_guide.png')

  // ガイド: アコーディオン展開
  await ev(page, () => {
    const card = document.querySelector('#guideList .g-card')
    if (card) card.classList.add('open')
  })
  await shot(page, 'proto_app_guide_accordion.png')

  // 通知一覧
  await ev(page, () => go('inbox'))
  await shot(page, 'proto_app_inbox.png')

  // 通知詳細
  await ev(page, () => openMsg(1))
  await shot(page, 'proto_app_inbox_detail.png')

  // マイページ
  await ev(page, () => go('mypage'))
  await shot(page, 'proto_app_mypage.png')

  // 設定
  await ev(page, () => go('settings'))
  await shot(page, 'proto_app_settings.png')

  await ctx.close()
}

// ── CONSOLE (v9) ─────────────────────────────────────────────────────────────
console.log('\n[CONSOLE v9]')
{
  const ctx  = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  await page.goto(CONSOLE_HTML)
  await page.waitForLoadState('domcontentloaded')

  // コンソールログイン画面
  await shot(page, 'proto_console_login.png')

  // Step1: パスワード入力 → TOTP画面へ
  await ev(page, () => {
    const m = document.getElementById('liMail')
    const p = document.getElementById('liPass')
    if (m) m.value = 'admin@mediabirth.jp'
    if (p) p.value = 'Demo1234!'
    doLogin1()
  })
  await shot(page, 'proto_console_login_totp.png')

  // Step2: TOTP (デモ: 任意6桁で通過)
  await ev(page, () => {
    const c = document.getElementById('liCode')
    if (c) c.value = '123456'
    doLogin2()
  })

  // ダッシュボード
  await shot(page, 'proto_console_dashboard.png')

  // 案件カンバン
  await ev(page, () => go('deals'))
  await shot(page, 'proto_console_deals.png')

  // 案件詳細ドロワー
  await ev(page, () => openDeal(1))
  await shot(page, 'proto_console_deal_drawer.png')
  await ev(page, () => closeAll())

  // パートナー一覧
  await ev(page, () => go('partners'))
  await shot(page, 'proto_console_partners.png')

  // パートナー詳細ドロワー
  await ev(page, () => openPartner(0))
  await shot(page, 'proto_console_partner_drawer.png')
  await ev(page, () => closeAll())

  // 問い合わせ
  await ev(page, () => go('inq'))
  await shot(page, 'proto_console_inquiries.png')

  // 問い合わせ詳細ドロワー
  await ev(page, () => openInq(1))
  await shot(page, 'proto_console_inquiry_drawer.png')
  await ev(page, () => closeAll())

  // サービス・報酬
  await ev(page, () => go('svcs'))
  await shot(page, 'proto_console_services.png')

  // サービス編集ドロワー (editSvc(0) = SVCS[0] = MOOM)
  await ev(page, () => editSvc(0))
  await shot(page, 'proto_console_services_edit.png')

  // ドロワー内スクロールして営業条件部分も撮影
  await ev(page, () => {
    const drb = document.getElementById('drBody')
    if (drb) drb.scrollTop = 500
  })
  await shot(page, 'proto_console_services_edit_bottom.png')
  await ev(page, () => closeAll())

  // 支払管理
  await ev(page, () => go('pay'))
  await shot(page, 'proto_console_payouts.png')

  // 配信
  await ev(page, () => go('cast'))
  await shot(page, 'proto_console_broadcasts.png')

  // 設定
  await ev(page, () => go('conf'))
  await shot(page, 'proto_console_settings.png')

  await ctx.close()
}

// ── ACCOUNT (v2) ─────────────────────────────────────────────────────────────
console.log('\n[ACCOUNT v2]')
{
  const ctx  = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await ctx.newPage()
  await page.goto(ACCOUNT_HTML)
  await page.waitForLoadState('domcontentloaded')

  await shot(page, 'proto_account_create_step1.png')

  // 次へボタンがあれば押す
  await ev(page, () => {
    const btns = [...document.querySelectorAll('button')]
    const next = btns.find(b => /次へ|next/i.test(b.textContent) && !b.disabled)
    if (next) next.click()
  })
  await shot(page, 'proto_account_create_step2.png')

  await ctx.close()
}

await browser.close()
console.log('\nDone. Saved to docs/reports/proto_screens/')
