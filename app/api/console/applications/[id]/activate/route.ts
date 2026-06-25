import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { notify } from '@/lib/notify/index'
import { resolveTemplateMedia } from '@/lib/notify/template-resolve'
import { pushTemplateImagesToPartner } from '@/lib/notify/template-media'

// Feature E（E-3）：応募の「承認＝仲間化」マークと、紹介元への“賞賛”通知（非金銭）。
// ★これは金銭オーバーライドではない。frontier・お金・deals・status・/r帰属には一切触れない。
// ★④b(confirmed入金通知=/api/internal/deal-won) とは完全に別経路の独立トリガ。event:'recognition'。
// 冪等：activated_at が既に立っていれば通知を再送しない（同applicationで一度だけ）。
// notify は web-push を含むため Node ランタイム。
export const runtime = 'nodejs'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params

    // 認証＋owner権限（console操作・anonセッションで判定）。
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role !== 'owner') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const admin = await createServiceRoleClient()
    const { data: app } = await admin
      .from('partner_applications')
      .select('id, name, referrer_partner_id, activated_at')
      .eq('id', id)
      .maybeSingle()
    if (!app) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // 既に活性化済み＝冪等にスキップ（賞賛通知は再送しない）。
    if (app.activated_at) return NextResponse.json({ ok: true, already: true })

    // 承認マーク（partner_applications の隔離フラグ。お金/アカウント/statusには非接触）。
    const { error: upErr } = await admin
      .from('partner_applications')
      .update({ activated_at: new Date().toISOString() })
      .eq('id', id)
      .is('activated_at', null)   // レース時も一度だけ
    if (upErr) return NextResponse.json({ error: '更新に失敗しました' }, { status: 500 })

    // 紹介元があれば賞賛通知を1件（非金銭・売上/成果/金額/件数は一切含めない＝非開示が設計原則）。
    let recognized = false
    if (app.referrer_partner_id) {
      // 文面のみ templates 優先解決（無ければ既存ハードコード文面へフォールバック）。発火/宛先/チャネル不変。
      const defaultBody = 'あなたの紹介に、心から感謝します。信頼の輪が、あなたから確かに広がっています。これからもどうぞよろしくお願いします。— MB Partners'
      const custom = await resolveTemplateMedia('recognition', { name: app.name })
      const body = custom?.body ?? defaultBody
      const payload = {
        title: `${app.name}さんが仲間に加わりました`,
        body,
        url: '/app',
        tag: `recognition-${app.id}`,
        ref: { type: 'recognition', application_id: app.id },
      }
      try {
        await notify(admin, app.referrer_partner_id, payload, { event: 'recognition' })
        // 画像付きテンプレ時のみ追加でLINE画像（best-effort・通知本体/発火は不変）。
        if (custom?.attachments?.length) await pushTemplateImagesToPartner(admin, app.referrer_partner_id, custom.attachments)
        recognized = true
      } catch { /* 通知失敗でも活性化は成立（例外安全） */ }
    }

    return NextResponse.json({ ok: true, recognized })
  } catch {
    return NextResponse.json({ error: '処理に失敗しました' }, { status: 500 })
  }
}
