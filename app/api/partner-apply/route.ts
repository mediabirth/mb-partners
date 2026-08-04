import { after, NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { partnerFacingOrigin, requestOrigin } from '@/lib/app-origin'
import {
  isHoneypotFilled,
  isPlainObject,
  readBoundedString,
  takePublicFormLimit,
} from '@/lib/public-form-defense'

// 外向けLP B1：/join の応募受け口（公開・認証不要）。partner_applications に保存するだけ。
// ★お金・deals・auth・アカウント作成・既存テーブルには一切触れない。常に例外安全。
export const runtime = 'edge'

export async function POST(req: NextRequest) {
  try {
    const parsed = await req.json().catch(() => null)
    if (!isPlainObject(parsed)) {
      return NextResponse.json({ error: '入力内容を確認してください' }, { status: 400 })
    }
    const b = parsed
    if (isHoneypotFilled(b.website)) return NextResponse.json({ ok: true })

    const nameField = readBoundedString(b, 'name', 200, { required: true })
    const emailField = readBoundedString(b, 'email', 254, { required: true, normalizeEmail: true })
    const phoneField = readBoundedString(b, 'phone', 50)
    const orgField = readBoundedString(b, 'org', 200)
    const expertiseField = readBoundedString(b, 'expertise', 200)
    const messageField = readBoundedString(b, 'message', 2_000)
    if (
      !nameField.ok || !emailField.ok || !phoneField.ok
      || !orgField.ok || !expertiseField.ok || !messageField.ok
      || b.consent !== true
    ) {
      return NextResponse.json({ error: '入力内容を確認してください' }, { status: 400 })
    }
    const name = nameField.value
    const email = emailField.value
    const phone = phoneField.value

    // 最低限のサーバ側検証：name必須／email必須（面談予約リンクの送付先＝招待制の起点）。
    if (!name) return NextResponse.json({ error: 'お名前を入力してください' }, { status: 400 })
    if (!email) return NextResponse.json({ error: 'メールアドレスを入力してください' }, { status: 400 })
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'メールアドレスを確認してください' }, { status: 400 })
    }
    const rate = await takePublicFormLimit(req, email)
    if (!rate.allowed) {
      return NextResponse.json(
        { error: '送信できませんでした。時間をおいて再度お試しください' },
        { status: 429, headers: { 'Retry-After': '300' } },
      )
    }

    const admin = await createServiceRoleClient()

    // Feature E（E-2）：?ref=<partner_id> を“紹介元の捕捉”として受理（非金銭・/r帰属やお金には一切関与しない）。
    // 実在 partner の id のときだけ referrer として保存。無効/未指定なら null。応募者は partner ではないため自己参照は起き得ない。
    let referrerPartnerId: string | null = null
    const rawRef = typeof b.ref === 'string' ? b.ref.trim() : ''
    if (/^[0-9a-fA-F-]{36}$/.test(rawRef)) {
      try {
        const { data: refP } = await admin.from('partners').select('id').eq('id', rawRef).maybeSingle()
        if (refP?.id) referrerPartnerId = refP.id
      } catch { /* 無効refは黙って null */ }
    }

    // LP種別: パートナー応募（既定）/ 出品の相談（サプライヤー）。それ以外の値は既定に丸める。
    const kind = b.kind === 'supplier' ? 'supplier' : 'partner'
    const { data: inserted, error } = await admin.from('partner_applications').insert({
      kind,
      name,
      org: orgField.value || null,
      expertise: expertiseField.value || null,
      email,
      phone: phone || null,
      message: messageField.value || null,
      consent: true,
      source: 'join_lp',
      status: 'applied',
      user_agent: (req.headers.get('user-agent') || '').slice(0, 300) || null,
      referrer_partner_id: referrerPartnerId,
      referrer_linked_at: referrerPartnerId ? new Date().toISOString() : null,
    }).select('interview_token').single()
    if (error || !inserted) return NextResponse.json({ error: '送信に失敗しました。時間をおいて再度お試しください。' }, { status: 500 })

    // EXP-1: 応募行の確定後、応募者・運営メールは応答後へ。メール失敗でも応募成功は従来どおり壊さない。
    const origin = partnerFacingOrigin(requestOrigin(req))
    const bookUrl = `${origin}/partners/interview/${inserted.interview_token}`
    after(async () => {
      try {
        const [{ sendTemplatedEmail }, { sendOpsEmail }] = await Promise.all([import('@/lib/mail-send'), import('@/lib/notify')])
        await Promise.all([
          sendTemplatedEmail({
            key: 'application-received', to: email, toRole: 'invitee',
            vars: { name, link: bookUrl }, buttons: [{ label: '面談を予約する', url: bookUrl }],
            meta: { source: 'join_lp' },
          }),
          sendOpsEmail(kind === 'supplier' ? '【MB Partners】出品の相談（サプライヤー）' : '【MB Partners】新規パートナー応募', `${kind === 'supplier' ? '出品の相談' : '新しい応募'}がありました。\n・お名前：${name}\n・メール：${email}${phone ? `\n・電話：${phone}` : ''}\n\nコンソール「パートナー応募」でステータスをご確認ください。`),
        ])
      } catch { /* best-effort：メール失敗でも応募は成立済み */ }
    })

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: '送信に失敗しました。時間をおいて再度お試しください。' }, { status: 500 })
  }
}
