/**
 * Transactional email helper (branded partner emails).
 *
 * Uses Resend's HTTP API (edge-compatible). Activates only when RESEND_API_KEY
 * is set — otherwise it's a safe no-op so the invite flow keeps working via the
 * manually-shared invite URL. Sender is the branded MB Partners address; this
 * requires the sending domain (mb-partners.app) to be verified in Resend with
 * SPF / DKIM / DMARC DNS records, otherwise Resend rejects the send.
 */
const FROM = 'MB Partners <noreply@mb-partners.app>'
const SUPPORT = 'support@mb-partners.app'

const LOGO_BAR =
`<div style="padding:20px 0;text-align:center">
  <img src="https://mb-partners.app/icon-192.png" alt="MB Partners" width="40" height="40" style="display:inline-block;vertical-align:middle;border-radius:9px" />
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
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [params.to], subject, text, html }),
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
}): Promise<{ sent: boolean; skipped?: string; error?: string }> {
  const key = process.env.RESEND_API_KEY
  if (!key) return { sent: false, skipped: 'RESEND_API_KEY not set' }
  if (!params.to) return { sent: false, skipped: 'no recipient' }

  const kindLabel = params.kind === 'meeting' ? '商談予約' : params.kind === 'cooperation' ? '協力のお申し込み' : 'ご紹介の登録'
  const engage = params.kind === 'cooperation' ? '協力' : '紹介'
  const name = params.partnerName?.trim() || 'パートナー'
  const meeting = params.meetingAt
    ? new Date(params.meetingAt).toLocaleString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' })
    : null

  const rows: [string, string][] = [
    ['お客さま', params.customerName],
    ...(params.serviceName ? [['サービス', params.menuName ? `${params.serviceName} / ${params.menuName}` : params.serviceName] as [string, string]] : []),
    ['関わり方', engage],
    ...(meeting ? [['商談日時', meeting] as [string, string]] : []),
  ]

  const subject = `【MB Partners】${kindLabel}を受け付けました`
  const text =
`${name} 様

${kindLabel}を受け付けました。内容は以下のとおりです。

${rows.map(([k, v]) => `・${k}：${v}`).join('\n')}

▼ この後の流れ
1. MBが内容を確認します
2. お客さまへ商談・ご提案
3. 成約で報酬が発生（月末締め・翌月末払い）

ご不明な点は ${SUPPORT} までお問い合わせください。
— MB Partners 運営事務局`

  const html =
`<div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:520px;margin:0 auto;color:#0E0E14;line-height:1.7">
  ${LOGO_BAR}
  <div style="background:#F6F6F8;border-radius:14px;padding:24px 22px">
    <p style="margin:0 0 14px">${name} 様</p>
    <p style="margin:0 0 16px"><b>${kindLabel}</b>を受け付けました。</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:18px">
      ${rows.map(([k, v]) => `<tr><td style="padding:6px 0;color:#6E707D;width:90px">${k}</td><td style="padding:6px 0;font-weight:600">${v}</td></tr>`).join('')}
    </table>
    <div style="background:#fff;border-radius:10px;padding:14px 16px">
      <div style="font-size:12px;font-weight:700;color:#4733E6;margin-bottom:8px">この後の流れ</div>
      <div style="font-size:13px;color:#41414E">1. MBが内容を確認 → 2. 商談・ご提案 → 3. 成約で報酬（月末締め・翌月末払い）</div>
    </div>
  </div>
  <p style="font-size:12px;color:#6E707D;margin:16px 4px 0">ご不明な点は <a href="mailto:${SUPPORT}" style="color:#4733E6">${SUPPORT}</a> まで。</p>
  <p style="font-size:12px;color:#9A9CA8;margin:8px 4px 24px">— MB Partners 運営事務局</p>
</div>`

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [params.to], subject, text, html }),
    })
    if (!res.ok) return { sent: false, error: `Resend ${res.status}` }
    return { sent: true }
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message : 'send failed' }
  }
}

export async function sendInviteEmail(params: {
  to: string
  name?: string | null
  url: string
  expiresAt?: string | null
}): Promise<{ sent: boolean; skipped?: string; error?: string }> {
  const key = process.env.RESEND_API_KEY
  if (!key) return { sent: false, skipped: 'RESEND_API_KEY not set' }

  const name = params.name?.trim() || 'パートナー'
  const expires = params.expiresAt
    ? new Date(params.expiresAt).toLocaleString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '発行から7日間'

  const subject = '【MB Partners】アカウント登録のご案内'
  const text =
`${name} 様

MB Partners パートナーアカウントの登録のご案内です。
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
    <img src="https://mb-partners.app/icon-192.png" alt="MB Partners" width="44" height="44" style="display:inline-block;vertical-align:middle;border-radius:10px" />
    <span style="font-weight:800;font-size:18px;vertical-align:middle;margin-left:10px">MB <span style="color:#4733E6">Partners</span></span>
  </div>
  <div style="background:#F6F6F8;border-radius:14px;padding:28px 24px">
    <p style="margin:0 0 14px">${name} 様</p>
    <p style="margin:0 0 18px">MB Partners パートナーアカウントの登録のご案内です。下記のボタンからパスワードを設定し、登録を完了してください。</p>
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
