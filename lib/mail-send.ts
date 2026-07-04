/**
 * テンプレ経由メール送信＋送信履歴（磨きプログラム①）。
 * - DB上書き: message_templates（category=key・is_active・最新1件）の subject/body を優先
 * - 無ければレジストリの既定文面（コード側フォールバック＝配信不能ゼロ）
 * - fallback: 既存の凝ったHTML（招待・受付等）を使う場合に呼び出し側から渡す（DB上書きが無いときのみ使用）
 * - 送信結果は mail_log へ必ず記録（best-effort・送信自体は阻害しない）
 */
import { sendEmail } from '@/lib/notify'
import { bodyToBrandedHtml } from '@/lib/mail-render'
import { MAIL_REGISTRY_BY_KEY, fillVars, type MailAudience } from '@/lib/mail-registry'

export { bodyToBrandedHtml }

export async function logMail(entry: {
  template_key?: string | null; event?: string | null
  to_email: string; to_role?: string | null; subject: string
  status: 'sent' | 'skipped' | 'error'; detail?: string | null
  meta?: Record<string, unknown> | null
}): Promise<void> {
  try {
    const { createServiceRoleClient } = await import('@/lib/supabase/server')
    const admin = await createServiceRoleClient()
    await admin.from('mail_log').insert({
      template_key: entry.template_key ?? null,
      event: entry.event ?? null,
      to_email: entry.to_email,
      to_role: entry.to_role ?? null,
      subject: entry.subject,
      status: entry.status,
      detail: entry.detail ?? null,
      meta: entry.meta ?? null,
    })
  } catch { /* 履歴は best-effort（送信を阻害しない） */ }
}

/** DB上書きの解決（subject/body）。無ければ null。 */
export async function resolveMailOverride(key: string): Promise<{ subject: string | null; body: string | null } | null> {
  try {
    const { createServiceRoleClient } = await import('@/lib/supabase/server')
    const admin = await createServiceRoleClient()
    const { data } = await admin
      .from('message_templates')
      .select('subject, body')
      .eq('is_active', true)
      .eq('category', key)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!data) return null
    if (!data.subject && !data.body?.trim()) return null
    return { subject: data.subject ?? null, body: data.body?.trim() ? data.body : null }
  } catch {
    return null
  }
}

export async function sendTemplatedEmail(params: {
  key: string
  to: string | null | undefined
  toRole: MailAudience
  vars: Record<string, string | number | null | undefined>
  meta?: Record<string, unknown>
  /** DB上書きが無いときに使う既存の凝った文面（省略時はレジストリ既定から生成） */
  fallback?: { subject?: string; text?: string; html?: string }
  /** CTAボタン（URLは動的値。DB上書き時も維持される） */
  buttons?: { label: string; url: string }[]
}): Promise<{ sent: boolean; skipped?: string; error?: string }> {
  const def = MAIL_REGISTRY_BY_KEY[params.key]
  const override = await resolveMailOverride(params.key)

  const subjectSrc = override?.subject || params.fallback?.subject || (def ? def.defaultSubject : '')
  const subject = fillVars(subjectSrc, params.vars)

  let text: string
  let html: string
  if (override?.body) {
    text = fillVars(override.body, params.vars)
    html = bodyToBrandedHtml(text, params.buttons)
  } else if (params.fallback?.text) {
    text = params.fallback.text
    html = params.fallback.html ?? bodyToBrandedHtml(text, params.buttons)
  } else if (def) {
    text = fillVars(def.defaultBody, params.vars)
    html = bodyToBrandedHtml(text, params.buttons)
  } else {
    return { sent: false, skipped: `unknown template key: ${params.key}` }
  }

  if (!params.to) {
    await logMail({ template_key: params.key, event: def?.event, to_email: '(宛先なし)', to_role: params.toRole, subject, status: 'skipped', detail: '宛先なし', meta: params.meta })
    return { sent: false, skipped: '宛先なし' }
  }

  const r = await sendEmail({ to: params.to, subject, text, html })
  await logMail({
    template_key: params.key,
    event: def?.event,
    to_email: params.to,
    to_role: params.toRole,
    subject,
    status: r.sent ? 'sent' : (r.error ? 'error' : 'skipped'),
    detail: r.error ?? r.skipped ?? null,
    meta: { ...params.meta, override: !!override },
  })
  return r
}
