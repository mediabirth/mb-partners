import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { notify } from '@/lib/notify/index'
import { resolveTemplateMedia } from '@/lib/notify/template-resolve'
import { pushTemplateImagesToPartner } from '@/lib/notify/template-media'

// Wave1-④b：成約確定の「コミット後」に呼ばれる内部通知エンドポイント（CRON_SECRET 保護・nodejs）。
// notify() で inbox + Web Push へ fan-out。お金・案件状態・status判定には一切触れない（読み取りのみ）。
// 金額は載せない（曖昧回避）＝実績画面リンクに留める。発火制御(多重送信防止)は呼び出し側=成約遷移時のみ。
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { dealId } = await req.json().catch(() => ({}))
  if (!dealId) return NextResponse.json({ error: 'dealId required' }, { status: 400 })

  const admin = await createServiceRoleClient()

  // 帰属 partner と顧客名を読み取るだけ（status/お金は読まない・書かない）。
  // D: メール送出のため顧客属性・顧客メール・サービス名も読む（読み取りのみ・金額は読まない）。
  const { data: deal } = await admin.from('deals')
    .select('id, partner_id, customer_name, customer_type, company_name, contact_name, customer_email, services(name)')
    .eq('id', dealId).single()
  if (!deal?.partner_id) return NextResponse.json({ ok: true, skipped: 'no partner' })

  const customer = deal.customer_name ?? 'お客さま'
  // 文面のみ templates 優先解決（無ければ既存ハードコード文面へフォールバック）。発火/宛先/チャネル/金額は不変。
  const defaultBody = `${customer} のご紹介が成約に至りました。報酬の詳細は実績画面でご確認いただけます。`
  const custom = await resolveTemplateMedia('deal-won', { customer })
  const body = custom?.body ?? defaultBody
  const payload = {
    title: '成約のお知らせ',
    body,
    url: '/app/rewards',
    tag: `deal-won-${dealId}`,
    ref: { type: 'deal', id: dealId },
  }

  const results = await notify(admin, deal.partner_id, payload, { event: 'deal_won' })
  // 画像/ボタン付きテンプレ時のみ、追加でLINE画像/カードを送付（best-effort・notify/金額/発火は不変）。
  if (custom?.attachments?.length || custom?.buttons?.length) await pushTemplateImagesToPartner(admin, deal.partner_id, custom.attachments ?? [], custom.buttons ?? [])

  // D: 成約メール（従来は inbox/Push のみで「お金に直結する最重要イベント」のメールが皆無だった）。
  // 発火制御は呼び出し側（confirmed 遷移時のみ）＝多重送信なし。全て best-effort・成約処理は不変。
  const emailed: Record<string, boolean> = {}
  try {
    const { sendOpsEmail } = await import('@/lib/notify')
    const { sendTemplatedEmail } = await import('@/lib/mail-send')
    const { customerHonorific } = await import('@/lib/customer')
    const svcName = (deal as { services?: { name?: string } | { name?: string }[] | null }).services
    const serviceLine = Array.isArray(svcName) ? svcName[0]?.name ?? null : svcName?.name ?? null
    const customerLabel = customerHonorific(deal as never) || 'お客さま'

    // パートナー宛（テンプレ経由・DB上書き可・送信履歴記録）
    const { data: pt } = await admin.from('partners').select('profile_id').eq('id', deal.partner_id).single()
    const { data: pr } = pt?.profile_id
      ? await admin.from('profiles').select('name, email').eq('id', pt.profile_id).single()
      : { data: null }
    if (pr?.email) {
      emailed.partner = (await sendTemplatedEmail({
        key: 'deal-won-partner', to: pr.email, toRole: 'partner',
        vars: { name: pr.name ?? 'パートナー', customer: customerLabel, link: 'https://mb-partners.app/app/rewards' },
        buttons: [{ label: '実績・報酬を見る', url: 'https://mb-partners.app/app/rewards' }],
        meta: { deal_id: dealId },
      })).sent
    }

    // お客さま宛（連絡先がある場合のみ・御礼）
    const custEmail = (deal as { customer_email?: string | null }).customer_email
    if (custEmail) {
      emailed.customer = (await sendTemplatedEmail({
        key: 'deal-won-customer', to: custEmail, toRole: 'customer',
        vars: { customer: customerLabel, service: serviceLine ?? '' },
        meta: { deal_id: dealId },
      })).sent
    }

    // 運営宛（従来 Slack も無かったイベント）
    emailed.ops = (await sendOpsEmail(
      `【MB Partners】成約: ${customer}`,
      `${customerLabel} の案件が成約になりました。${serviceLine ? `\n・サービス：${serviceLine}` : ''}\n・案件ID：${dealId}\n（金額はコンソールでご確認ください）`,
      undefined,
      { event: '成約', meta: { deal_id: dealId } },
    )).sent
  } catch { /* best-effort */ }

  return NextResponse.json({ ok: true, partnerId: deal.partner_id, channels: results, emailed })
}
