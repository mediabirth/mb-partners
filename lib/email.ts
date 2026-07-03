/**
 * Transactional email helper (branded partner emails).
 *
 * Uses Resend's HTTP API (edge-compatible). Activates only when RESEND_API_KEY
 * is set — otherwise it's a safe no-op so the invite flow keeps working via the
 * manually-shared invite URL. Sender is the branded MB Partners address; this
 * requires the sending domain (mb-partners.app) to be verified in Resend with
 * SPF / DKIM / DMARC DNS records, otherwise Resend rejects the send.
 */
import { MAIL_FROM as FROM } from './mail-from'
import { resolveTemplateMedia } from './notify/template-resolve'
import { emailAttachmentsFromTemplate } from './notify/template-media'
import { brandedEmailHtml } from './notify'

const SUPPORT = 'support@mb-partners.app'

const LOGO_BAR =
`<div style="padding:20px 0;text-align:center">
  <img src="https://mb-partners.app/icon-512.png" alt="MB Partners" width="40" height="40" style="display:inline-block;vertical-align:middle;border-radius:9px" />
  <span style="font-weight:800;font-size:17px;vertical-align:middle;margin-left:9px">MB <span style="color:#4733E6">Partners</span></span>
</div>`

/**
 * R1① 顧客への予約完了メール（ベストエフォート）。予約日時＋打ち合わせ案内。
 */
export async function sendBookingConfirmEmail(params: {
  to: string
  clientName?: string | null
  partnerName?: string | null
  startAt: string
  meetingUrl?: string | null
}): Promise<{ sent: boolean; skipped?: string; error?: string }> {
  const key = process.env.RESEND_API_KEY
  if (!key) return { sent: false, skipped: 'RESEND_API_KEY not set' }
  if (!params.to) return { sent: false, skipped: 'no recipient' }
  const when = new Date(params.startAt).toLocaleString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' })
  const nm = params.clientName?.trim() || 'お客様'
  const subject = '【MB Partners】ご予約を承りました'
  const linkLine = params.meetingUrl ? `\n▼ 打ち合わせリンク\n${params.meetingUrl}\n` : ''
  const text =
`${nm} 様

ご予約を承りました。当日はどうぞよろしくお願いいたします。

▼ 日時
${when}
${linkLine}
ご不明な点は ${SUPPORT} までお問い合わせください。
— MB Partners 運営事務局`
  const html =
`<div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:520px;margin:0 auto;color:#0E0E14;line-height:1.7">
  ${LOGO_BAR}
  <div style="background:#F6F6F8;border-radius:14px;padding:24px 22px">
    <p style="margin:0 0 14px">${nm} 様</p>
    <p style="margin:0 0 16px">ご予約を承りました。当日はどうぞよろしくお願いいたします。</p>
    <div style="background:#fff;border-radius:10px;padding:14px 16px;margin-bottom:12px">
      <div style="font-size:12px;color:#6E707D;margin-bottom:4px">日時</div>
      <div style="font-size:15px;font-weight:700;color:#1E3A8A">${when}</div>
    </div>
    ${params.meetingUrl ? `<p style="margin:0"><a href="${params.meetingUrl}" style="color:#2563EB;font-weight:600">打ち合わせリンクを開く</a></p>` : '<p style="margin:0;font-size:13px;color:#6E707D">カレンダー招待を別途お送りする場合があります。</p>'}
  </div>
  <p style="font-size:12px;color:#6E707D;margin:16px 4px 0">ご不明な点は <a href="mailto:${SUPPORT}" style="color:#4733E6">${SUPPORT}</a> まで。</p>
  <p style="font-size:12px;color:#9A9CA8;margin:8px 4px 24px">— MB Partners 運営事務局</p>
</div>`
  // 文面のみ templates 優先解決（無ければ既存 text/html へフォールバック）。宛先/送信経路/件名は不変。
  const custom = await resolveTemplateMedia('booking', { name: nm, when, meetingUrl: params.meetingUrl ?? '' })
  const finalText = custom?.body ?? text
  const finalHtml = custom?.body ? brandedEmailHtml({ lead: custom.body, buttons: custom.buttons }) : html
  // 画像付きテンプレ時のみ Resend 添付（未設定なら従来と完全同一）。
  const tplAttach = custom?.attachments?.length ? await emailAttachmentsFromTemplate(custom.attachments) : undefined
  const payload: Record<string, unknown> = { from: FROM, to: [params.to], subject, text: finalText, html: finalHtml }
  if (tplAttach) payload.attachments = tplAttach
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) return { sent: false, error: `Resend ${res.status}` }
    return { sent: true }
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message : 'send failed' }
  }
}

/**
 * C2④ パートナー本人への受付確認メール（ベストエフォート）。
 * 紹介登録 / 協力申込 / 商談予約 の完了時に送信。RESEND_API_KEY 未設定なら no-op。
 */
export async function sendReceiptEmail(params: {
  to: string
  partnerName?: string | null
  kind: 'referral' | 'cooperation' | 'meeting'
  customerName: string
  serviceName?: string | null
  menuName?: string | null
  meetingAt?: string | null
  meetingUrl?: string | null
  caseUrl?: string | null   // v3.1：案件ページURL（本文で「進捗はこちら」）
}): Promise<{ sent: boolean; skipped?: string; error?: string }> {
  const key = process.env.RESEND_API_KEY
  if (!key) return { sent: false, skipped: 'RESEND_API_KEY not set' }
  if (!params.to) return { sent: false, skipped: 'no recipient' }

  // v3.1：パートナー向けから「協力/関わり方」の区分を排除。受付＝「ご紹介」で統一（商談予約のみ別ラベル）。
  const kindLabel = params.kind === 'meeting' ? '商談予約' : 'ご紹介'
  const name = params.partnerName?.trim() || 'パートナー'
  const meeting = params.meetingAt
    ? new Date(params.meetingAt).toLocaleString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' })
    : null
  const serviceLine = params.serviceName ? (params.menuName ? `${params.serviceName} ─ ${params.menuName}` : params.serviceName) : ''
  const caseUrl = params.caseUrl?.trim() || ''

  const rows: [string, string][] = [
    ['お客さま', params.customerName],
    ...(serviceLine ? [['メニュー', serviceLine] as [string, string]] : []),
    ...(meeting ? [['商談日時', meeting] as [string, string]] : []),
  ]

  const meetLineText = params.meetingUrl ? `\n▼ オンライン会議（Google Meet）\n${params.meetingUrl}\n` : ''
  const caseLineText = caseUrl ? `\n▼ 案件ページ（進捗はこちら）\n${caseUrl}\n` : ''

  const subject = `【MB Partners】${kindLabel}を受け付けました`
  const text =
`${name} 様

${kindLabel}を受け付けました。

${rows.map(([k, v]) => `・${k}：${v}`).join('\n')}
${meetLineText}
このあとはMBがお客さまへご連絡します。進捗は案件ページでご確認いただけます。
${caseLineText}
※ 本プログラムは成功報酬制です。報酬は成約時のみ発生します（税抜表示・消費税はインボイス登録の有無に応じて支払時に別途）。

ご不明な点は ${SUPPORT} までお問い合わせください。
— MB Partners 運営事務局`

  const html =
`<div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:520px;margin:0 auto;color:#0E0E14;line-height:1.7">
  ${LOGO_BAR}
  <div style="background:#F6F6F8;border-radius:14px;padding:24px 22px">
    <p style="margin:0 0 14px">${name} 様</p>
    <p style="margin:0 0 16px">${kindLabel}を受け付けました。</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:18px">
      ${rows.map(([k, v]) => `<tr><td style="padding:6px 0;color:#6E707D;width:90px">${k}</td><td style="padding:6px 0">${v}</td></tr>`).join('')}
    </table>
    ${params.meetingUrl ? `<div style="background:#fff;border-radius:10px;padding:14px 16px;margin-bottom:12px">
      <div style="font-size:12px;color:#6E707D;margin-bottom:6px">オンライン会議（Google Meet）</div>
      <a href="${params.meetingUrl}" style="color:#2563EB;word-break:break-all">${params.meetingUrl}</a>
    </div>` : ''}
    <div style="background:#fff;border-radius:10px;padding:14px 16px">
      <div style="font-size:13px;color:#41414E">このあとはMBがお客さまへご連絡します。進捗は案件ページでご確認いただけます。</div>
      ${caseUrl ? `<div style="margin-top:10px"><a href="${caseUrl}" style="color:#4733E6;word-break:break-all">案件ページを開く</a></div>` : ''}
      <div style="font-size:12px;color:#6E707D;margin-top:8px">※ 本プログラムは成功報酬制です。報酬は成約時のみ発生します（税抜表示・消費税はインボイス登録の有無に応じて支払時に別途）。</div>
    </div>
  </div>
  <p style="font-size:12px;color:#6E707D;margin:16px 4px 0">ご不明な点は <a href="mailto:${SUPPORT}" style="color:#4733E6">${SUPPORT}</a> まで。</p>
  <p style="font-size:12px;color:#9A9CA8;margin:8px 4px 24px">— MB Partners 運営事務局</p>
</div>`

  // 文面のみ templates 優先解決（無ければ既存 text/html へフォールバック）。宛先/送信経路/件名は不変。
  const custom = await resolveTemplateMedia('receipt', { name, kind: kindLabel, customer: params.customerName, service: serviceLine, meeting: meeting ?? '', link: caseUrl })
  const finalText = custom?.body ?? text
  const finalHtml = custom?.body ? brandedEmailHtml({ lead: custom.body, buttons: custom.buttons }) : html
  const tplAttach = custom?.attachments?.length ? await emailAttachmentsFromTemplate(custom.attachments) : undefined
  const payload: Record<string, unknown> = { from: FROM, to: [params.to], subject, text: finalText, html: finalHtml }
  if (tplAttach) payload.attachments = tplAttach
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) return { sent: false, error: `Resend ${res.status}` }
    return { sent: true }
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message : 'send failed' }
  }
}

// 招待メール（kind別文面）。partner は従来文面のまま（既存呼び出しは kind 省略＝byte互換）。
type InviteKind = 'partner' | 'member' | 'frontier' | 'vendor'
const INVITE_COPY: Record<InviteKind, { subject: string; fallbackName: string; lead: string }> = {
  partner:  { subject: '【MB Partners】アカウント登録のご案内', fallbackName: 'パートナー',  lead: 'MB Partners パートナーアカウントの登録のご案内です。' },
  member:   { subject: '【MB Partners】運営メンバー招待のご案内', fallbackName: 'ご担当者', lead: 'MB Partners の運営メンバーとしてご招待します。下記のリンクから登録を完了してください。' },
  frontier: { subject: '【MB Partners】パートナー招待のご案内',   fallbackName: 'パートナー',  lead: 'MB Partners のパートナーとしてご招待します。下記のリンクから登録を完了してください。' },
  vendor:   { subject: '【MB Partners】お取引のご案内',           fallbackName: 'ご担当者', lead: 'MB Partners の業務委託先（デリバリー）としてご登録のご案内です。下記のリンクから登録を完了してください。' },
}

export async function sendInviteEmail(params: {
  to: string
  name?: string | null
  url: string
  expiresAt?: string | null
  kind?: InviteKind
}): Promise<{ sent: boolean; skipped?: string; error?: string }> {
  const key = process.env.RESEND_API_KEY
  if (!key) return { sent: false, skipped: 'RESEND_API_KEY not set' }

  const copy = INVITE_COPY[params.kind ?? 'partner'] ?? INVITE_COPY.partner
  const name = params.name?.trim() || copy.fallbackName
  const expires = params.expiresAt
    ? new Date(params.expiresAt).toLocaleString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '発行から7日間'

  const subject = copy.subject
  const text =
`${name} 様

${copy.lead}
下記のリンクからパスワードを設定し、登録を完了してください。

▼ パスワード設定リンク
${params.url}

有効期限：${expires}
※期限を過ぎた場合は、お手数ですが再発行をご依頼ください。

ご不明な点は ${SUPPORT} までお問い合わせください。

— MB Partners 運営事務局`

  const html =
`<div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:520px;margin:0 auto;color:#0E0E14;line-height:1.7">
  <div style="padding:24px 0;text-align:center">
    <img src="https://mb-partners.app/icon-512.png" alt="MB Partners" width="44" height="44" style="display:inline-block;vertical-align:middle;border-radius:10px" />
    <span style="font-weight:800;font-size:18px;vertical-align:middle;margin-left:10px">MB <span style="color:#4733E6">Partners</span></span>
  </div>
  <div style="background:#F6F6F8;border-radius:14px;padding:28px 24px">
    <p style="margin:0 0 14px">${name} 様</p>
    <p style="margin:0 0 18px">${copy.lead}下記のボタンからパスワードを設定し、登録を完了してください。</p>
    <p style="text-align:center;margin:24px 0">
      <a href="${params.url}" style="display:inline-block;background:#4733E6;color:#fff;text-decoration:none;font-weight:700;padding:13px 26px;border-radius:9px">パスワードを設定する</a>
    </p>
    <p style="margin:0 0 6px;font-size:13px;color:#6E707D">ボタンが開けない場合は次のURLをブラウザに貼り付けてください：</p>
    <p style="margin:0 0 18px;font-size:12px;word-break:break-all;color:#4733E6">${params.url}</p>
    <p style="margin:0;font-size:13px;color:#6E707D">有効期限：${expires}<br/>※期限を過ぎた場合は、お手数ですが再発行をご依頼ください。</p>
  </div>
  <p style="font-size:12px;color:#6E707D;margin:18px 4px 0">ご不明な点は <a href="mailto:${SUPPORT}" style="color:#4733E6">${SUPPORT}</a> までお問い合わせください。</p>
  <p style="font-size:12px;color:#9A9CA8;margin:8px 4px 24px">— MB Partners 運営事務局</p>
</div>`

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [params.to], subject, text, html }),
    })
    if (!res.ok) return { sent: false, error: `Resend ${res.status}: ${(await res.text()).slice(0, 200)}` }
    return { sent: true }
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message : 'send failed' }
  }
}
