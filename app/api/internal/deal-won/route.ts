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
  const { data: deal } = await admin.from('deals').select('id, partner_id, customer_name').eq('id', dealId).single()
  if (!deal?.partner_id) return NextResponse.json({ ok: true, skipped: 'no partner' })

  const customer = deal.customer_name ?? 'お客さま'
  // 文面のみ templates 優先解決（無ければ既存ハードコード文面へフォールバック）。発火/宛先/チャネル/金額は不変。
  const defaultBody = `${customer} のご紹介が成約に至りました。報酬の詳細は実績画面でご確認いただけます。`
  const custom = await resolveTemplateMedia('deal-won', { customer })
  const body = custom?.body ?? defaultBody
  const payload = {
    title: '🎉 成約しました！',
    body,
    url: '/app/rewards',
    tag: `deal-won-${dealId}`,
    ref: { type: 'deal', id: dealId },
  }

  const results = await notify(admin, deal.partner_id, payload, { event: 'deal_won' })
  // 画像/ボタン付きテンプレ時のみ、追加でLINE画像/カードを送付（best-effort・notify/金額/発火は不変）。
  if (custom?.attachments?.length || custom?.buttons?.length) await pushTemplateImagesToPartner(admin, deal.partner_id, custom.attachments ?? [], custom.buttons ?? [])
  return NextResponse.json({ ok: true, partnerId: deal.partner_id, channels: results })
}
