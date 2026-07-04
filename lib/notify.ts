/**
 * 共通通知モジュール（Batch B）
 *
 * 既存の Resend / Slack 配線を再利用した薄いラッパ。
 * - sendSlack(text)        … 運営Slack（SLACK_WEBHOOK_URL）へ送信
 * - sendEmail({to,...})    … 任意宛先へ Resend 送信（verified domain noreply@mb-partners.app）
 * - sendOpsEmail(...)      … 運営の受信先（OPS_NOTIFY_EMAIL）へ送信
 *
 * 鉄則：
 * - すべて best-effort。例外は外へ投げない（core action / money path を絶対にブロックしない）。
 * - env 未設定の経路は throw せず { sent:false, skipped } を返してスキップ（halt しない）。
 * - エッジ/ノード両対応（global fetch のみ使用）。
 */
import { notifySlack } from './slack'
import { MAIL_FROM as FROM } from './mail-from'
// 磨き①: HTML描画は lib/mail-render.ts（純関数・クライアント安全）へ移設。既存importの互換のため再export。
import { brandedEmailHtml } from './mail-render'
export { brandedEmailHtml }

export type SendResult = { sent: boolean; skipped?: string; error?: string }

/** JST の読みやすい日時表記。 */
export function fmtJST(iso: string): string {
  return new Date(iso).toLocaleString('ja-JP', {
    year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo',
  })
}

/** 運営Slack（SLACK_WEBHOOK_URL）。未設定ならスキップ。例外は投げない。 */
export async function sendSlack(text: string): Promise<SendResult> {
  if (!process.env.SLACK_WEBHOOK_URL) return { sent: false, skipped: 'SLACK_WEBHOOK_URL 未設定' }
  try {
    await notifySlack(text)
    return { sent: true }
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message : 'slack failed' }
  }
}

/** 任意宛先へメール送信（Resend）。RESEND_API_KEY 未設定 / 宛先なしはスキップ。例外は投げない。 */
export async function sendEmail(params: {
  to?: string | null; subject: string; text: string; html?: string
  attachments?: { filename: string; content: string }[]   // additive：base64 content。省略時は従来と完全同一動作（既存呼び出し不変）。
  buttons?: { label: string; url: string }[]   // additive：URLボタン。省略時は従来と完全同一（既定HTML時のみ反映）。
}): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY
  if (!key) return { sent: false, skipped: 'RESEND_API_KEY 未設定' }
  if (!params.to) return { sent: false, skipped: '宛先なし' }
  const html = params.html
    ?? brandedEmailHtml({ lead: params.text.split('\n')[0] || params.subject, note: params.text.split('\n').slice(1).join(' ').trim() || undefined, buttons: params.buttons })
  try {
    const payload: Record<string, unknown> = { from: FROM, to: [params.to], subject: params.subject, text: params.text, html }
    if (params.attachments && params.attachments.length > 0) payload.attachments = params.attachments   // 付与時のみ追加＝既存呼び出しは body byte-unchanged
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

/**
 * 段階C：運営宛先の解決。組織宛先（OPS_NOTIFY_EMAIL・据置フォールバック）＋
 * member_notification_prefs の email_enabled な email_to 全員（重複除去）。
 * prefs が空/未作成/読取不能なら OPS のみ＝従来と完全同一（非破壊）。best-effort。
 */
async function resolveOpsRecipients(): Promise<string[]> {
  const set = new Set<string>()
  const ops = process.env.OPS_NOTIFY_EMAIL
  if (ops) set.add(ops.trim().toLowerCase())
  try {
    const { createServiceRoleClient } = await import('./supabase/server')
    const svc = await createServiceRoleClient()
    const { data } = await svc.from('member_notification_prefs').select('email_to, email_enabled')
    for (const r of (data ?? []) as { email_to: string | null; email_enabled: boolean }[]) {
      if (r.email_enabled && r.email_to && r.email_to.includes('@')) set.add(r.email_to.trim().toLowerCase())
    }
  } catch { /* prefs 未作成/読取不能 → OPS のみ（従来動作） */ }
  return [...set]
}

/** 運営の受信先へメール。OPS_NOTIFY_EMAIL ＋ メンバー宛先（prefs）全員へ配信。未設定/宛先なしならスキップ。
 *  磨き①: 送信履歴（mail_log）へ必ず記録（best-effort・送信は阻害しない）。 */
export async function sendOpsEmail(subject: string, text: string, html?: string, log?: { event?: string; meta?: Record<string, unknown> }): Promise<SendResult> {
  const recipients = await resolveOpsRecipients()
  if (recipients.length === 0) return { sent: false, skipped: 'OPS_NOTIFY_EMAIL 未設定' }
  // 各宛先へ個別送信（1件失敗が他を止めない・best-effort）。1件でも送れたら sent:true。
  let anySent = false
  let lastErr: string | undefined
  for (const to of recipients) {
    const r = await sendEmail({ to, subject, text, html })
    if (r.sent) anySent = true
    else if (r.error) lastErr = r.error
    try {
      const { logMail } = await import('./mail-send')
      await logMail({ event: log?.event ?? null, to_email: to, to_role: 'ops', subject, status: r.sent ? 'sent' : (r.error ? 'error' : 'skipped'), detail: r.error ?? r.skipped ?? null, meta: log?.meta ?? null })
    } catch { /* best-effort */ }
  }
  return anySent ? { sent: true } : { sent: false, error: lastErr ?? 'no recipient sent' }
}
