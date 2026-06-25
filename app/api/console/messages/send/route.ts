import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { lineChannel } from '@/lib/notify/line'
import { getLineAccessToken } from '@/lib/notify/line-token'
import { buildRichFlex, type FlexButton } from '@/lib/notify/line-flex'
import { parseBlocks, blocksToLineMessages, blocksToEmailInnerHtml, legacyFromBlocks } from '@/lib/notify/blocks'
import { sendEmail, brandedEmailHtml } from '@/lib/notify'

// メッセージセンター Phase1+3A：owner の手動送信（LINE push/image・Resendメール+添付）＋ 全履歴を隔離表 messages(direction='out') へ記録。
// ★既存 notify() ディスパッチャ（通知4種/リマインド/勝ち通知）には割り込まない＝独立した手動送信経路。
// ★既存 lineChannel.deliver（text push）は byte-unchanged。画像送信は本route内の新経路として追加（割り込まない）。
// ★money/deals/帰属/既存RLS 非接触。messages のみ書込（service_role）。例外安全（throwしない）。
export const runtime = 'nodejs'

const MAX_BODY = 5000
const ATTACH_BUCKET = 'message-attachments'

type ImgAttach = { type: 'image'; path: string; filename?: string }
function imageAttachments(raw: unknown): ImgAttach[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((a: { type?: string; path?: string }) => a?.type === 'image' && typeof a?.path === 'string').slice(0, 4) as ImgAttach[]
}
function richButtons(raw: unknown): FlexButton[] {
  if (!Array.isArray(raw)) return []
  return raw.map((b: { label?: string; url?: string }) => ({ label: (b?.label ?? '').trim(), url: (b?.url ?? '').trim() }))
    .filter(b => b.label && /^https?:\/\//i.test(b.url)).slice(0, 3)
}

export async function POST(req: NextRequest) {
  try {
    // owner gate（既存consoleパターン）。
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role !== 'owner') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const b = await req.json().catch(() => ({}))
    const channel = b.channel === 'email' ? 'email' : b.channel === 'line' ? 'line' : null
    const partnerId = typeof b.partnerId === 'string' && b.partnerId ? b.partnerId : null
    const customerEmail = typeof b.customerEmail === 'string' && b.customerEmail.trim() ? b.customerEmail.trim() : null
    const subject = typeof b.subject === 'string' ? b.subject.trim().slice(0, 200) : null
    const body = typeof b.body === 'string' ? b.body.trim().slice(0, MAX_BODY) : ''
    const images = imageAttachments(b.attachments)   // 新shape [{type:'image',path}]・Storage参照
    const buttons = richButtons(b.buttons)           // リッチ：[{label,url}] http/https・最大3
    const blocks = parseBlocks(b.blocks)             // ★ブロック方式（順序保持）。設定時は blocks 優先
    if (!channel) return NextResponse.json({ error: 'channel が不正です' }, { status: 400 })
    if (!body && images.length === 0 && buttons.length === 0 && blocks.length === 0) return NextResponse.json({ error: '本文・画像・ボタン・ブロックのいずれかを入力してください' }, { status: 400 })

    const admin = await createServiceRoleClient()
    const threadKey = partnerId ? `partner:${partnerId}` : customerEmail ? `email:${customerEmail.toLowerCase()}` : null
    if (!threadKey) return NextResponse.json({ error: '送信先がありません' }, { status: 400 })

    let status = 'sent'
    let error: string | null = null

    if (channel === 'line') {
      // partner × LINE：line_user_id がある partner のみ（無ければ未連携エラー・記録は残さず400）。
      if (!partnerId) return NextResponse.json({ error: 'LINEはパートナー宛のみです' }, { status: 400 })
      const { data: link } = await admin.from('partner_line_links').select('line_user_id').eq('partner_id', partnerId).maybeSingle()
      if (!link?.line_user_id) return NextResponse.json({ error: 'このパートナーはLINE未連携です' }, { status: 400 })
      if (blocks.length > 0) {
        // ★ブロック方式（順序保持）。blocks 指定時はこちら（既存 text/image/Flex 経路には割り込まない）。
        const token = await getLineAccessToken()
        if (!token) { status = 'failed'; error = 'LINEトークン取得不可' }
        else {
          const msgs = await blocksToLineMessages(blocks, async (p) => { const { data: s } = await admin.storage.from(ATTACH_BUCKET).createSignedUrl(p, 60 * 60 * 24); return s?.signedUrl ?? null })
          if (!msgs.length) { status = 'failed'; error = '送信内容がありません' }
          else {
            const res = await fetch('https://api.line.me/v2/bot/message/push', {
              method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({ to: link.line_user_id, messages: msgs }),
            })
            if (!res.ok) { status = 'failed'; error = 'LINEブロック送信に失敗しました' }
          }
        }
      } else if (buttons.length > 0) {
        // リッチ：ボタンありは Flex 1枚（hero=先頭画像・body=本文・footer=ボタン）。既存text/image経路には割り込まない。
        const token = await getLineAccessToken()
        if (!token) { status = 'failed'; error = 'LINEトークン取得不可' }
        else {
          let imageUrl: string | null = null
          if (images.length) { const { data: signed } = await admin.storage.from(ATTACH_BUCKET).createSignedUrl(images[0].path, 60 * 60 * 24); imageUrl = signed?.signedUrl ?? null }
          const flex = buildRichFlex({ imageUrl, body: body || null, buttons, altText: body || undefined })
          if (!flex) { status = 'failed'; error = '送信内容がありません' }
          else {
            const res = await fetch('https://api.line.me/v2/bot/message/push', {
              method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({ to: link.line_user_id, messages: [flex] }),
            })
            if (!res.ok) { status = 'failed'; error = 'LINEカード送信に失敗しました' }
          }
        }
      } else if (images.length === 0) {
        // 既存どおり text push（lineChannel.deliver は byte-unchanged）。
        const r = await lineChannel.deliver(admin, partnerId, { title: '', body })
        if (r.sent < 1) { status = 'failed'; error = 'LINE送信に失敗しました' }
      } else {
        // 新経路：image（+text）push。署名URLを originalContentUrl/previewImageUrl に使用。
        const token = await getLineAccessToken()
        if (!token) { status = 'failed'; error = 'LINEトークン取得不可' }
        else {
          const msgs: Array<Record<string, unknown>> = []
          if (body) msgs.push({ type: 'text', text: body })
          for (const a of images) {
            const { data: signed } = await admin.storage.from(ATTACH_BUCKET).createSignedUrl(a.path, 60 * 60 * 24)
            if (signed?.signedUrl) msgs.push({ type: 'image', originalContentUrl: signed.signedUrl, previewImageUrl: signed.signedUrl })
          }
          if (msgs.length === 0) { status = 'failed'; error = '送信内容がありません' }
          else {
            const res = await fetch('https://api.line.me/v2/bot/message/push', {
              method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({ to: link.line_user_id, messages: msgs }),
            })
            if (!res.ok) { status = 'failed'; error = 'LINE画像送信に失敗しました' }
          }
        }
      }
    } else if (blocks.length > 0) {
      // ★ブロック方式メール：順序付きHTML（image は署名URLで inline・button は aタグ）。
      if (!customerEmail) return NextResponse.json({ error: 'メール宛先がありません' }, { status: 400 })
      const urlMap: Record<string, string> = {}
      for (const bl of blocks) { if (bl.type === 'image') { const { data: s } = await admin.storage.from(ATTACH_BUCKET).createSignedUrl(bl.path, 60 * 60 * 24 * 7); if (s?.signedUrl) urlMap[bl.path] = s.signedUrl } }
      const innerHtml = blocksToEmailInnerHtml(blocks, p => urlMap[p] ?? null)
      const plain = legacyFromBlocks(blocks).body || '（メッセージ）'
      const r = await sendEmail({ to: customerEmail, subject: subject || 'MB Partners', text: plain, html: brandedEmailHtml({ blocksHtml: innerHtml }) })
      if (!r.sent) { status = 'failed'; error = r.skipped || r.error || 'メール送信に失敗しました' }
    } else {
      // email：customerEmail（顧客 or パートナーのメール）宛。画像は Storage path から base64 化して Resend 添付。
      if (!customerEmail) return NextResponse.json({ error: 'メール宛先がありません' }, { status: 400 })
      let mailAttachments: { filename: string; content: string }[] | undefined
      if (images.length) {
        mailAttachments = []
        for (const a of images) {
          const { data: blob } = await admin.storage.from(ATTACH_BUCKET).download(a.path)
          if (blob) {
            const buf = Buffer.from(await blob.arrayBuffer())
            mailAttachments.push({ filename: a.filename || a.path.split('/').pop() || 'image', content: buf.toString('base64') })
          }
        }
      }
      const r = await sendEmail({ to: customerEmail, subject: subject || 'MB Partners', text: body || '（画像を送付しました）', attachments: mailAttachments, buttons: buttons.length ? buttons : undefined })
      if (!r.sent) { status = 'failed'; error = r.skipped || r.error || 'メール送信に失敗しました' }
    }

    // 送信成否に関わらず out を記録（失敗も status='failed'＋error で残す）。添付は Storageパス参照で保存（base64は保存しない）。
    const derived = blocks.length ? legacyFromBlocks(blocks) : null
    const recBody = derived ? (derived.body || '[ブロック]') : body
    const recAttachments = derived ? (derived.attachments.length ? derived.attachments : null) : (images.length ? images.map(a => ({ type: 'image', path: a.path })) : null)
    const { data: row } = await admin.from('messages').insert({
      partner_id: partnerId, customer_email: customerEmail, direction: 'out', channel,
      subject, body: recBody, attachments: recAttachments,
      status, error, sent_by: user.id, thread_key: threadKey,
    }).select('id, created_at, direction, channel, body, subject, status, error, thread_key, attachments').single()

    return NextResponse.json({ ok: status === 'sent', status, error, message: row })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '送信に失敗しました' }, { status: 500 })
  }
}
