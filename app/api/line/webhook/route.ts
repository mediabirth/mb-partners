import { NextRequest, NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { getLineAccessToken } from '@/lib/notify/line-token'
import { resolveTemplate } from '@/lib/notify/template-resolve'

// メッセージセンター Phase2：LINE Messaging API 受信 webhook（additive・新設）。
// ★署名検証必須（x-line-signature を LINE_CHANNEL_SECRET で HMAC-SHA256→base64・生body比較）。不一致/欠如は 401。
// ★検証OKなら常に200（LINE再送ループ防止）。例外は握って200（記録失敗はログのみ）。
// ★messages 隔離表のみ書込。partner_line_links は read-only 突合。money/deals/帰属/既存notify 非接触。
export const runtime = 'nodejs'

const ATTACH_BUCKET = 'message-attachments'

export async function POST(req: NextRequest) {
  // 1) 署名検証（生body）。
  const secret = process.env.LINE_CHANNEL_SECRET
  const sig = req.headers.get('x-line-signature')
  const raw = await req.text()
  if (!secret || !sig) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const expected = crypto.createHmac('sha256', secret).update(raw).digest('base64')
  const a = Buffer.from(sig); const b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return NextResponse.json({ error: 'bad signature' }, { status: 401 })

  // 2) 検証OK。events を処理（失敗しても常に200）。
  try {
    const data = JSON.parse(raw) as { events?: Array<Record<string, any>> }
    const events = Array.isArray(data.events) ? data.events : []
    if (events.length === 0) return NextResponse.json({ ok: true })   // 検証用 verify(空events) も200
    const admin = await createServiceRoleClient()

    for (const ev of events) {
      try {
        // Phase3-C あいさつ自前化（独立追加・受信 logic非接触）：follow受信時、greetingテンプレがあれば1通返信。
        // テンプレ未設定なら沈黙（＝現状どおり・LINE Manager側あいさつに委ねる＝後方互換）。
        if (ev.type === 'follow') {
          try {
            const greeting = await resolveTemplate('greeting', {})
            const replyToken: string | undefined = ev.replyToken
            if (greeting && replyToken) {
              const token = await getLineAccessToken()
              if (token) {
                await fetch('https://api.line.me/v2/bot/message/reply', {
                  method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                  body: JSON.stringify({ replyToken, messages: [{ type: 'text', text: greeting }] }),
                })
              }
            }
          } catch { /* あいさつ失敗は握る（200維持） */ }
          continue
        }
        if (ev.type !== 'message') continue                              // message のみ（follow/unfollow/その他は記録しない）
        const userId: string | undefined = ev.source?.userId
        if (!userId) continue
        const eventId: string | null = ev.webhookEventId ?? null
        const msg = ev.message ?? {}

        // 突合（read-only）。未連携は partner_id=null＋thread_key='line:'+userId で保持（未知送信者の可視化）。
        const { data: link } = await admin.from('partner_line_links').select('partner_id').eq('line_user_id', userId).maybeSingle()
        const partnerId: string | null = (link?.partner_id as string | undefined) ?? null
        const threadKey = partnerId ? `partner:${partnerId}` : `line:${userId}`

        let body = ''
        let attachments: Array<{ type: string; path: string }> | null = null

        if (msg.type === 'text') {
          body = typeof msg.text === 'string' ? msg.text.slice(0, 5000) : ''
        } else if (msg.type === 'image') {
          body = '[画像]'
          // content取得（api-data.line.me・Bearer）→ private バケットへ保存。
          try {
            const token = await getLineAccessToken()
            if (token && msg.id) {
              const r = await fetch(`https://api-data.line.me/v2/bot/message/${msg.id}/content`, { headers: { Authorization: `Bearer ${token}` } })
              if (r.ok) {
                const buf = Buffer.from(await r.arrayBuffer())
                const ct = r.headers.get('content-type') || 'image/jpeg'
                const ext = ct.includes('png') ? 'png' : 'jpg'
                const path = `line/${userId}/${msg.id}.${ext}`
                const up = await admin.storage.from(ATTACH_BUCKET).upload(path, buf, { contentType: ct, upsert: true })
                if (!up.error) attachments = [{ type: 'image', path }]
              }
            }
          } catch { /* 画像取得失敗は本文記録のみ */ }
        } else {
          continue                                                        // sticker/video/audio/location 等は今は記録しない
        }

        // 冪等：line_event_id で事前突合（既存ならスキップ）。partial unique index は競合時のbackstop
        // （PostgREST upsert は partial index を推論できないため、明示select→insert方式にする）。
        if (eventId) {
          const { data: dup } = await admin.from('messages').select('id').eq('line_event_id', eventId).maybeSingle()
          if (dup) continue
        }
        await admin.from('messages').insert({
          partner_id: partnerId, customer_email: null, direction: 'in', channel: 'line',
          body, attachments, status: 'received', thread_key: threadKey, line_event_id: eventId,
        })
      } catch { /* 個別event失敗は握る（LINE再送防止のため200を返す） */ }
    }
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: true })   // パース失敗等も200（署名は既に検証済）
  }
}
