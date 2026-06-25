/**
 * メッセージセンター Phase3-D①：自動メッセージのテンプレ画像 送信ヘルパー（additive・best-effort）。
 * ★画像付きテンプレが設定されている場合のみ呼ばれる。未設定/画像なしなら呼び出し側で何もしない＝完全後方互換。
 * ★money/deals/帰属/status/発火 には一切触れない。例外は投げない（必ず握る）。既存 notify()/lineChannel は不変。
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { getLineAccessToken } from '@/lib/notify/line-token'
import type { TemplateImage } from '@/lib/notify/template-resolve'

const ATTACH_BUCKET = 'message-attachments'

/**
 * LINE連携済 partner へテンプレ画像を image message として追加push（既存 text push は別経路・不変）。
 * 送った画像は messages(out, channel='line', attachments) に best-effort 記録（隔離表のみ）。
 */
export async function pushTemplateImagesToPartner(admin: SupabaseClient, partnerId: string, attachments: TemplateImage[]): Promise<void> {
  try {
    if (!attachments?.length) return
    const { data: link } = await admin.from('partner_line_links').select('line_user_id').eq('partner_id', partnerId).maybeSingle()
    const userId = link?.line_user_id as string | undefined
    if (!userId) return
    const token = await getLineAccessToken()
    if (!token) return
    const msgs: Array<Record<string, unknown>> = []
    for (const a of attachments.slice(0, 4)) {
      const { data: signed } = await admin.storage.from(ATTACH_BUCKET).createSignedUrl(a.path, 60 * 60 * 24)
      if (signed?.signedUrl) msgs.push({ type: 'image', originalContentUrl: signed.signedUrl, previewImageUrl: signed.signedUrl })
    }
    if (!msgs.length) return
    const res = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ to: userId, messages: msgs }),
    })
    await admin.from('messages').insert({
      partner_id: partnerId, direction: 'out', channel: 'line', body: '[画像]',
      attachments, status: res.ok ? 'sent' : 'failed', thread_key: `partner:${partnerId}`,
    })
  } catch { /* best-effort：画像送信失敗は通知本体に影響させない */ }
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
