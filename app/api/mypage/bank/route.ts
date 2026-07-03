/**
 * POST /api/mypage/bank — 振込口座の直接変更（B: 申請制廃止・勝彦決定③）。
 * 必須の安全装置:
 *   1) 変更履歴を audit_logs に記録（before/after・actor）
 *   2) 登録メールアドレスへ変更通知を送信（本人が身に覚えのない変更に気づける）
 * money 計算・支払ロジックには一切触れない（partners.bank の表示用JSONのみ）。
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'

export const runtime = 'edge'

type BankInfo = {
  bank_name: string
  branch_name: string
  account_type: string
  account_number: string
  account_holder: string
}

const mask = (n: string) => n ? `***${n.slice(-4)}` : ''

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const s = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
  const next: BankInfo = {
    bank_name: s(body.bank_name, 60),
    branch_name: s(body.branch_name, 60),
    account_type: s(body.account_type, 10) || '普通',
    account_number: s(body.account_number, 10),
    account_holder: s(body.account_holder, 60),
  }
  if (!next.bank_name || !next.branch_name || !next.account_number || !next.account_holder) {
    return NextResponse.json({ error: '振込先口座をすべて入力してください' }, { status: 400 })
  }
  if (!/^\d{4,8}$/.test(next.account_number)) {
    return NextResponse.json({ error: '口座番号は数字で入力してください' }, { status: 400 })
  }

  const admin = await createServiceRoleClient()
  const [{ data: partner }, { data: profile }] = await Promise.all([
    admin.from('partners').select('id, code, bank').eq('profile_id', user.id).single(),
    admin.from('profiles').select('name, email').eq('id', user.id).single(),
  ])
  if (!partner) return NextResponse.json({ error: 'Partner not found' }, { status: 404 })

  const before = (partner.bank ?? null) as BankInfo | null

  const { error: upErr } = await admin.from('partners').update({ bank: next }).eq('id', partner.id)
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  // 1) 変更履歴（必須）— audit_logs へ before/after を記録
  const { error: logErr } = await admin.from('audit_logs').insert({
    actor_profile_id: user.id,
    actor_name: profile?.name ?? '(不明)',
    category: 'bank_change',
    target: `partner:${partner.code}`,
    action: 'update',
    meta: { before, after: next },
  })
  if (logErr) {
    // 履歴が残せない場合は変更を巻き戻して失敗させる（履歴必須の決定に従う）
    await admin.from('partners').update({ bank: before }).eq('id', partner.id)
    return NextResponse.json({ error: `変更履歴の記録に失敗しました: ${logErr.message}` }, { status: 500 })
  }

  // 2) 登録メールへ通知（best-effort・RESEND_API_KEY 未設定環境では自動 no-op）
  let notified = false
  try {
    const { sendEmail, sendOpsEmail, brandedEmailHtml } = await import('@/lib/notify')
    if (profile?.email) {
      const r = await sendEmail({
        to: profile.email,
        subject: '【MB Partners】振込口座の変更を受け付けました',
        text: [
          `${profile.name ?? ''} 様`,
          '',
          '振込口座の変更を受け付けました。',
          '',
          `・銀行：${next.bank_name} ${next.branch_name}`,
          `・口座：${next.account_type} ${mask(next.account_number)}`,
          `・名義：${next.account_holder}`,
          '',
          '心当たりのない変更の場合は、恐れ入りますがすぐに support@mb-partners.app までご連絡ください。',
        ].join('\n'),
        html: brandedEmailHtml({
          lead: `${profile.name ?? ''} 様　振込口座の変更を受け付けました。`,
          rows: [
            ['銀行', `${next.bank_name} ${next.branch_name}`],
            ['口座', `${next.account_type} ${mask(next.account_number)}`],
            ['名義', next.account_holder],
          ],
          note: '心当たりのない変更の場合は、すぐにサポートまでご連絡ください。',
        }),
      })
      notified = r.sent
    }
    await sendOpsEmail(
      '【MB Partners】振込口座が変更されました',
      `パートナー ${profile?.name ?? ''}（${partner.code}）が振込口座を変更しました。\n・銀行：${next.bank_name} ${next.branch_name}\n・口座：${next.account_type} ${mask(next.account_number)}\n・名義：${next.account_holder}\n（変更履歴は audit_logs / bank_change に記録済み）`,
    )
  } catch { /* best-effort */ }

  return NextResponse.json({ ok: true, notified })
}
