import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'

// 外向けLP B1：/join の応募受け口（公開・認証不要）。partner_applications に保存するだけ。
// ★お金・deals・auth・アカウント作成・既存テーブルには一切触れない。常に例外安全。
export const runtime = 'edge'

export async function POST(req: NextRequest) {
  try {
    const b = await req.json().catch(() => ({}))
    const name = typeof b.name === 'string' ? b.name.trim().slice(0, 200) : ''
    const email = typeof b.email === 'string' ? b.email.trim().slice(0, 200) : ''
    const phone = typeof b.phone === 'string' ? b.phone.trim().slice(0, 50) : ''

    // 最低限のサーバ側検証：name必須／email・phone どちらか必須。
    if (!name) return NextResponse.json({ error: 'お名前を入力してください' }, { status: 400 })
    if (!email && !phone) return NextResponse.json({ error: 'メールか電話のいずれかをご入力ください' }, { status: 400 })

    const admin = await createServiceRoleClient()
    const { error } = await admin.from('partner_applications').insert({
      name,
      org: typeof b.org === 'string' ? b.org.trim().slice(0, 200) : null,
      expertise: typeof b.expertise === 'string' ? b.expertise.trim().slice(0, 200) : null,
      email: email || null,
      phone: phone || null,
      message: typeof b.message === 'string' ? b.message.trim().slice(0, 2000) : null,
      consent: b.consent === true,
      source: 'join_lp',
      user_agent: (req.headers.get('user-agent') || '').slice(0, 300) || null,
    })
    if (error) return NextResponse.json({ error: '送信に失敗しました。時間をおいて再度お試しください。' }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: '送信に失敗しました。時間をおいて再度お試しください。' }, { status: 500 })
  }
}
