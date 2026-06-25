/**
 * メッセージセンター Phase3-D①：自動メッセージのテンプレ画像 送信ヘルパー（additive・best-effort）。
 * ★画像付きテンプレが設定されている場合のみ呼ばれる。未設定/画像なしなら呼び出し側で何もしない＝完全後方互換。
 * ★money/deals/帰属/status/発火 には一切触れない。例外は投げない（必ず握る）。既存 notify()/lineChannel は不変。
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { getLineAccessToken } from '@/lib/notify/line-token'
import { buildRichFlex, type FlexButton } from '@/lib/notify/line-flex'
import type { TemplateImage } from '@/lib/notify/template-resolve'

const ATTACH_BUCKET = 'message-attachments'

/**
 * LINE連携済 partner へテンプレ画像/ボタンを追加push（既存 text push＝notify は別経路・不変）。
 * ★buttons 無し＝従来どおり image message（byte-unchanged）。buttons あり＝Flex（hero画像＋footerボタン）。
 * 送信内容は messages(out, channel='line') に best-effort 記録（隔離表のみ）。
 */
export async function pushTemplateImagesToPartner(admin: SupabaseClient, partnerId: string, attachments: TemplateImage[], buttons: FlexButton[] = []): Promise<void> {
  try {
    const imgs = attachments ?? []
    const btns = (buttons ?? []).filter(b => b?.label && /^https?:\/\//i.test(b?.url ?? '')).slice(0, 3)
    if (!imgs.length && !btns.length) return
    const { data: link } = await admin.from('partner_line_links').select('line_user_id').eq('partner_id', partnerId).maybeSingle()
    const userId = link?.line_user_id as string | undefined
    if (!userId) return
    const token = await getLineAccessToken()
    if (!token) return
    let msgs: Array<Record<string, unknown>> = []
    let recordBody = '[画像]'
    if (btns.length) {
      // リッチ：hero=先頭画像（あれば）＋footer=ボタン の Flex 1枚。本文textは notify が別送のため載せない（二重回避）。
      let imageUrl: string | null = null
      if (imgs.length) { const { data: signed } = await admin.storage.from(ATTACH_BUCKET).createSignedUrl(imgs[0].path, 60 * 60 * 24); imageUrl = signed?.signedUrl ?? null }
      const flex = buildRichFlex({ imageUrl, buttons: btns })
      if (!flex) return
      msgs = [flex]
      recordBody = '[カード]'
    } else {
      // 従来どおり image message（byte-unchanged）。
      for (const a of imgs.slice(0, 4)) {
        const { data: signed } = await admin.storage.from(ATTACH_BUCKET).createSignedUrl(a.path, 60 * 60 * 24)
        if (signed?.signedUrl) msgs.push({ type: 'image', originalContentUrl: signed.signedUrl, previewImageUrl: signed.signedUrl })
      }
      if (!msgs.length) return
    }
    const res = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ to: userId, messages: msgs }),
    })
    await admin.from('messages').insert({
      partner_id: partnerId, direction: 'out', channel: 'line', body: recordBody,
      attachments: imgs.length ? imgs : null, status: res.ok ? 'sent' : 'failed', thread_key: `partner:${partnerId}`,
    })
  } catch { /* best-effort：追加送信の失敗は通知本体に影響させない */ }
}

/** テンプレ画像（Storageパス）を Resend添付（base64）に変換。失敗/空は undefined。自前で service_role を生成。 */
export async function emailAttachmentsFromTemplate(attachments: TemplateImage[]): Promise<{ filename: string; content: string }[] | undefined> {
  try {
    if (!attachments?.length) return undefined
    const admin = await createServiceRoleClient()
    const out: { filename: string; content: string }[] = []
    for (const a of attachments.slice(0, 4)) {
      const { data: blob } = await admin.storage.from(ATTACH_BUCKET).download(a.path)
      if (blob) {
        const buf = Buffer.from(await blob.arrayBuffer())
        out.push({ filename: a.path.split('/').pop() || 'image', content: buf.toString('base64') })
      }
    }
    return out.length ? out : undefined
  } catch {
    return undefined
  }
}
