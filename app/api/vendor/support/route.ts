/**
 * POST /api/vendor/support — ベンダー（デリバリー）からの運営お問い合わせ。
 * inquiries はパートナー専用(partner_id NOT NULL)のため、ベンダーは運営へ直接通知（Email/Slack）で届ける。
 * ★お金・案件・認証には非接触。本人(vendor)セッションのみ。
 */
import { NextRequest, NextResponse } from 'next/server'
import { resolveVendor } from '@/lib/vendor-auth'
import { createServiceRoleClient } from '@/lib/supabase/server'

const CAT: Record<string, string> = { payout: '委託費について', case: '案件について', account: 'アカウントについて', other: 'その他' }

export async function POST(req: NextRequest) {
  const vendor = await resolveVendor()
  if (!vendor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const b = await req.json()
  const category = CAT[b.category] ? b.category : 'other'
  const subject = String(b.subject ?? '').trim().slice(0, 120)
  const body = String(b.body ?? '').trim().slice(0, 4000)
  if (!body) return NextResponse.json({ error: 'お問い合わせ内容を入力してください' }, { status: 400 })

  // 連絡先（返信用）：deliveries.contact_email、無ければ auth email。
  let replyTo = '—'
  try {
    const admin = await createServiceRoleClient()
    const { data: d } = await admin.from('deliveries').select('contact_email, auth_user_id').eq('id', vendor.deliveryId).maybeSingle()
    replyTo = (d?.contact_email as string) || '—'
    if (replyTo === '—' && d?.auth_user_id) {
      const { data: u } = await admin.auth.admin.getUserById(d.auth_user_id as string)
      replyTo = u?.user?.email ?? '—'
    }
  } catch { /* best-effort */ }

  const title = `🛠️ デリバリー問い合わせ（${CAT[category]}）: ${vendor.deliveryName}`
  const text = `${subject ? subject + '\n\n' : ''}${body}\n\n— 委託先: ${vendor.deliveryName} / 返信先: ${replyTo}`
  let delivered = false
  try {
    const { sendOpsEmail, sendSlack } = await import('@/lib/notify')
    const [em] = await Promise.all([
      sendOpsEmail(title, text).catch(() => ({ sent: false })),
      sendSlack(`${title}\n${text}`).catch(() => {}),
    ])
    delivered = !!(em as { sent?: boolean })?.sent
  } catch { /* best-effort */ }

  return NextResponse.json({ ok: true, delivered })
}
