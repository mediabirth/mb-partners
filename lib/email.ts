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
