/**
 * POST /api/vendor/accept  — vendor 招待を承認し、auth ユーザー＋profiles(role='vendor') を作成、
 * deliveries.auth_user_id に紐付ける。パートナーの accept（/api/invite/accept）とは別ルート＝partner非接触。
 * 招待は invites(kind='vendor', delivery_id) を検証。
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { attachSurfaceProfile } from '@/lib/identity'

const VENDOR_COLORS = ['#15917E', '#4733E6', '#D98914', '#C2479E', '#2A7DE1', '#9333EA']

export const runtime = 'edge'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  // partner 登録と同等のフルフィールド（住所・電話・税区分・振込先・インボイス・規約同意）を受理・永続化。
  const {
    token, email: clientEmail, password, name,
    phone, address, taxType, bankName, branchName, accountType, accountNumber, accountHolder, invoiceNumber,
    agreeTerms, agreePrivacy,
  } = body
  if (!token) return NextResponse.json({ error: 'token は必須です' }, { status: 400 })
  if (!name?.trim()) return NextResponse.json({ error: 'お名前を入力してください' }, { status: 400 })
  if (!password || password.length < 8) return NextResponse.json({ error: 'パスワードは8文字以上で設定してください' }, { status: 400 })

  const service = await createServiceRoleClient()

  // ── 招待検証（vendor 限定）──
  const { data: invite, error: inviteErr } = await service
    .from('invites').select('id, email, role, kind, delivery_id, expires_at, used_at').eq('token', token).single()
  if (inviteErr || !invite) return NextResponse.json({ error: '招待リンクが見つかりません' }, { status: 404 })
  if (invite.kind !== 'vendor' || invite.role !== 'vendor') return NextResponse.json({ error: 'この招待は業務委託先向けではありません' }, { status: 400 })
  if (!invite.delivery_id) return NextResponse.json({ error: '招待に業務委託先が紐づいていません' }, { status: 400 })
  if (invite.used_at) return NextResponse.json({ error: 'この招待リンクはすでに使用済みです' }, { status: 409 })
  if (new Date(invite.expires_at) < new Date()) return NextResponse.json({ error: '招待リンクの有効期限が切れています' }, { status: 410 })

  const email = invite.email
  if (clientEmail && clientEmail.toLowerCase().trim() !== email.toLowerCase().trim()) {
    return NextResponse.json({ error: 'メールアドレスが招待と一致しません' }, { status: 400 })
  }

  // ── auth.users 作成（既存なら password 更新）──
  let userId: string
  const { data: created, error: createErr } = await service.auth.admin.createUser({
    email, password, email_confirm: true, app_metadata: { role: 'vendor' },
  })
  if (created?.user) {
    userId = created.user.id
  } else {
    const isExists = (createErr as { status?: number })?.status === 422 ||
      createErr?.message?.toLowerCase().includes('already')
    if (!isExists) return NextResponse.json({ error: 'ユーザー作成に失敗しました', detail: createErr?.message }, { status: 500 })
    const { data: prof } = await service.from('profiles').select('id').ilike('email', email).maybeSingle()
    if (prof?.id) userId = prof.id
    else {
      const { data: list } = await service.auth.admin.listUsers({ page: 1, perPage: 1000 })
      const ex = list?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase())
      if (!ex) return NextResponse.json({ error: 'ユーザーが見つかりませんでした' }, { status: 500 })
      userId = ex.id
    }
    const { error: upErr } = await service.auth.admin.updateUserById(userId, { password, email_confirm: true })
    if (upErr) return NextResponse.json({ error: 'パスワード更新に失敗しました', detail: upErr.message }, { status: 500 })
  }

  // ── profiles 付与（中央の門）──
  // ★既存プロフィール（別メール用途＝partner 等）の role は絶対に上書きしない。
  //   vendor としての「本人性」は下の deliveries.auth_user_id 紐づけで担保する（resolveVendor が linkage で判定）。
  //   これにより同一メールが partner と vendor を安全に兼任できる（アイデンティティ入れ替わりの構造的封鎖）。
  //   なお vendor の表示名は deliveries.name/nickname 側が正（profiles.name は上書きせず既存面の表示を保全）。
  const color = VENDOR_COLORS[Math.floor(Math.random() * VENDOR_COLORS.length)]
  try {
    const r = await attachSurfaceProfile(service, { userId, email, name: name.trim(), role: 'vendor', color })
    // 既存が partner 等でも role は保全（keptRole）。新規なら role='vendor' で作成済み。
    void r
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, detail: 'profiles attach failed' }, { status: 500 })
  }

  // ── deliveries に紐付け＋KYC/振込情報を永続化（partner 登録と同等）──
  //   auth_user_id が vendor の本人性の真実。name（お名前/屋号）＋KYC項目を deliveries に確定する。
  //   bank_account は「種別+番号」を結合（deliveries は単一列・mypage表示「普通1234567」に一致）。
  //   税区分は日本語ラベルで保存（mypage の lock 行がそのまま表示）。money 列（base_fee 等）には非接触。
  const nowIso = new Date().toISOString()
  const acctType = (accountType === '当座' ? '当座' : '普通')
  const bankAccount = accountNumber?.trim() ? `${acctType}${accountNumber.trim()}` : null
  const deliveryPatch: Record<string, unknown> = {
    auth_user_id: userId,
    name: name.trim(),
    phone: (typeof phone === 'string' ? phone.trim() : '') || null,
    address: (typeof address === 'string' ? address.trim() : '') || null,
    tax_type: taxType === 'corporate' ? '法人' : taxType === 'individual' ? '個人' : (taxType || null),
    bank_name: (typeof bankName === 'string' ? bankName.trim() : '') || null,
    bank_branch: (typeof branchName === 'string' ? branchName.trim() : '') || null,
    bank_account: bankAccount,
    bank_holder_kana: (typeof accountHolder === 'string' ? accountHolder.trim() : '') || null,
    invoice_number: (typeof invoiceNumber === 'string' ? invoiceNumber.trim() : '') || null,
    terms_agreed_at: agreeTerms ? nowIso : null,
    privacy_agreed_at: agreePrivacy ? nowIso : null,
    updated_at: nowIso,
  }
  const { error: linkErr } = await service.from('deliveries').update(deliveryPatch).eq('id', invite.delivery_id)
  if (linkErr) return NextResponse.json({ error: linkErr.message, detail: 'deliveries link failed' }, { status: 500 })

  // ── 招待を使用済みに ──
  await service.from('invites').update({ used_at: nowIso, name: name.trim() }).eq('token', token)

  return NextResponse.json({ ok: true }, { status: 200 })
}
