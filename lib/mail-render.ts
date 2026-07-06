/**
 * メールHTML描画（純関数・クライアント/サーバ両用）。
 * コンソールのテンプレ管理画面がライブプレビューに使うため、環境依存（env/Slack/supabase）ゼロで分離。
 * brandedEmailHtml は lib/notify.ts から移設（notify側は再exportで互換維持）。
 */
const SUPPORT = 'support@mb-partners.app'

const LOGO_BAR =
`<div style="padding:20px 0;text-align:center">
  <img src="https://mb-partners.app/icon-512.png" alt="MB Partners" width="40" height="40" style="display:inline-block;vertical-align:middle;border-radius:9px" />
  <span style="font-weight:800;font-size:17px;vertical-align:middle;margin-left:9px">MB <span style="color:#4733E6">Partners</span></span>
</div>`

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** 上品・簡潔なブランドHTML（本文段落 + 任意の明細行 + 任意のURLボタン／または blocksHtml で順序付きブロック描画）。 */
export function brandedEmailHtml(params: { lead?: string; rows?: [string, string][]; note?: string; buttons?: { label: string; url: string }[]; blocksHtml?: string }): string {
  // blocksHtml（順序付きブロック）が来たら本文部分はそれを使う（additive・既存呼び出しは未指定で従来通り）。
  if (params.blocksHtml) {
    return `<div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:520px;margin:0 auto;color:#0E0E14;line-height:1.7">
  ${LOGO_BAR}
  <div style="background:#F6F6F8;border-radius:14px;padding:24px 22px">${params.blocksHtml}</div>
  <p style="font-size:12px;color:#6E707D;margin:16px 4px 0">ご不明な点は <a href="mailto:${SUPPORT}" style="color:#4733E6">${SUPPORT}</a> まで。</p>
  <p style="font-size:12px;color:#9A9CA8;margin:8px 4px 24px">— MB Partners 運営事務局</p>
</div>`
  }
  const lead = params.lead ?? ''
  const rows = params.rows?.length
    ? `<table style="width:100%;border-collapse:collapse;font-size:14px;margin:4px 0 14px">
        ${params.rows.map(([k, v]) => `<tr><td style="padding:6px 0;color:#6E707D;width:96px">${escapeHtml(k)}</td><td style="padding:6px 0;font-weight:600">${escapeHtml(v)}</td></tr>`).join('')}
      </table>`
    : ''
  // ボタン（http/httpsのみ・additive・省略時は従来と完全同一）。
  const validButtons = (params.buttons ?? []).filter(b => b?.label && /^https?:\/\//i.test(b?.url ?? '')).slice(0, 3)
  const buttons = validButtons.length
    ? `<div style="margin:18px 0 2px">${validButtons.map(b => `<a href="${escapeHtml(b.url)}" style="display:inline-block;background:#4733E6;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:11px 22px;border-radius:9px;margin:0 8px 8px 0">${escapeHtml(b.label)}</a>`).join('')}</div>`
    : ''
  return `<div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:520px;margin:0 auto;color:#0E0E14;line-height:1.7">
  ${LOGO_BAR}
  <div style="background:#F6F6F8;border-radius:14px;padding:24px 22px">
    <p style="margin:0 0 16px">${escapeHtml(lead)}</p>
    ${rows}
    ${params.note ? `<p style="margin:0;font-size:13px;color:#6E707D">${escapeHtml(params.note)}</p>` : ''}
    ${buttons}
  </div>
  <p style="font-size:12px;color:#6E707D;margin:16px 4px 0">ご不明な点は <a href="mailto:${SUPPORT}" style="color:#4733E6">${SUPPORT}</a> まで。</p>
  <p style="font-size:12px;color:#9A9CA8;margin:8px 4px 24px">— MB Partners 運営事務局</p>
</div>`
}

/** 本文テキスト（複数行）→ ブランドHTML（改行保持・CTAはボタンで誘導） */
export function bodyToBrandedHtml(body: string, buttons?: { label: string; url: string }[]): string {
  const validButtons = (buttons ?? []).filter(b => b?.label && /^https?:\/\//i.test(b?.url ?? '')).slice(0, 3)
  const btnHtml = validButtons.length
    ? `<div style="margin:18px 0 2px">${validButtons.map(b => `<a href="${escapeHtml(b.url)}" style="display:inline-block;background:#4733E6;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:11px 22px;border-radius:9px;margin:0 8px 8px 0">${escapeHtml(b.label)}</a>`).join('')}</div>`
    : ''
  return brandedEmailHtml({ blocksHtml: `<p style="white-space:pre-wrap;margin:0;font-size:14px;line-height:1.8">${escapeHtml(body)}</p>${btnHtml}` })
}
