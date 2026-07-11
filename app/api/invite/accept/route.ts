/**
 * POST /api/invite/accept
 *
 * Validates the invite token and creates a confirmed auth user WITH a password.
 * The client then calls signInWithPassword() directly — no magic link, no hash.
 *
 * Strategy for "user already exists":
 *   - createUser returns HTTP 422 → look up userId from our profiles table (email column)
 *   - Then updateUserById to set the password (re-invite / password reset via new invite)
 *   - Avoids admin.listUsers() which is paginated and unreliable for lookup by email
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { attachSurfaceProfile } from '@/lib/identity'

const PARTNER_COLORS = ['#4733E6', '#C2479E', '#15917E', '#D98914', '#E64733', '#9333EA']

function generatePartnerCode(name: string): string {
  const upper = name.trim().toUpperCase().replace(/[^A-Z]/g, '')
  const prefix = upper.length >= 2 ? upper.slice(0, 2) : ('ZZ' + upper).slice(-2)
  return prefix + Math.floor(1000 + Math.random() * 9000)
}

export const runtime = 'edge'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const {
    token, email: clientEmail, password,
    lastName, firstName, nickname, phone, address,
    taxType, bankName, branchName, accountType, accountNumber, accountHolder, invoiceNumber,
    agreeTerms, agreePrivacy,
    name: legacyName,
    frontierFlag, frontierId,   // R2: ?role=frontier → is_frontier / ?f=<id> → 配下紐づけ
  } = body

  const name = (lastName || firstName)
    ? `${(lastName ?? '').trim()} ${(firstName ?? '').trim()}`.trim()
    : (legacyName ?? '').trim()

  if (!token)  return NextResponse.json({ error: 'token は必須です' }, { status: 400 })
  if (!name)   return NextResponse.json({ error: 'お名前を入力してください' }, { status: 400 })
  if (!password || password.length < 8) {
    return NextResponse.json({ error: 'パスワードは8文字以上で設定してください' }, { status: 400 })
  }

  // Full 4-step registration requires reward-receipt info + consent.
  const fullRegistration = lastName !== undefined || taxType !== undefined
  if (fullRegistration) {
    if (!phone?.trim()) return NextResponse.json({ error: '電話番号を入力してください' }, { status: 400 })
    if (!address?.trim()) return NextResponse.json({ error: '住所を入力してください' }, { status: 400 })
    if (!['individual', 'corporate'].includes(taxType)) return NextResponse.json({ error: '区分を選択してください' }, { status: 400 })
    if (!bankName?.trim() || !branchName?.trim() || !accountType?.trim() || !accountNumber?.trim() || !accountHolder?.trim()) {
      return NextResponse.json({ error: '振込先口座をすべて入力してください' }, { status: 400 })
    }
    if (!agreeTerms || !agreePrivacy) return NextResponse.json({ error: '規約・プライバシーへの同意が必要です' }, { status: 400 })
  }

  const service = await createServiceRoleClient()

  // ── 招待トークン検証 ──────────────────────────────────────────────────────
  const { data: invite, error: inviteErr } = await service
    .from('invites')
    .select('id, email, role, expires_at, used_at, is_frontier')
    .eq('token', token)
    .single()

  if (inviteErr || !invite)
    return NextResponse.json({ error: '招待リンクが見つかりません' }, { status: 404 })
  if (invite.used_at)
    return NextResponse.json({ error: 'この招待リンクはすでに使用済みです' }, { status: 409 })
  if (new Date(invite.expires_at) < new Date())
    return NextResponse.json({ error: '招待リンクの有効期限が切れています' }, { status: 410 })

  // Safety check: email from form must match invite
  const email = invite.email
  if (clientEmail && clientEmail.toLowerCase().trim() !== email.toLowerCase().trim()) {
    return NextResponse.json({ error: 'メールアドレスが招待と一致しません' }, { status: 400 })
  }

  const { role } = invite

  // ── auth.users 作成 ──────────────────────────────────────────────────────
  let userId: string

  const { data: created, error: createErr } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role },   // B2: roleクレームを付与（middlewareがDBなしで判定）
  })

  if (created?.user) {
    // New user created successfully
    userId = created.user.id
  } else {
    // Determine if user already exists (Supabase returns HTTP 422 for duplicate email)
    const isAlreadyExists =
      (createErr as any)?.status === 422 ||
      createErr?.message?.toLowerCase().includes('already been registered') ||
      createErr?.message?.toLowerCase().includes('already exists') ||
      createErr?.message?.toLowerCase().includes('duplicate')

    if (!isAlreadyExists) {
      // Unexpected error — return details for debugging
      return NextResponse.json(
        {
          error: `ユーザー作成に失敗しました`,
          detail: createErr?.message ?? 'unknown',
          code:   (createErr as any)?.status ?? 'unknown',
        },
        { status: 500 }
      )
    }

    // ── User already exists: look up via profiles.email (our DB) ────────────
    // Prefer this over admin.listUsers() which is paginated and slower.
    const { data: profileRow, error: profileLookupErr } = await service
      .from('profiles')
      .select('id, role')
      .ilike('email', email)   // case-insensitive match
      .maybeSingle()

    // ★アカウント乗っ取りガード（2026-07-11・招待セッション事故の根因修理）:
    //   既存ユーザーのメールに対するパートナー招待受諾は、既存 role が partner の場合のみ許可。
    //   運営（owner/manager/admin）や委託先（vendor）のメールを再利用すると、下の updateUserById が
    //   その人のパスワードを上書き＝全セッション失効（コンソール自動ログアウト事故）を起こすため、ここで遮断する。
    let existingRole: string | null = (profileRow as { role?: string } | null)?.role ?? null

    if (profileRow?.id) {
      userId = profileRow.id
    } else {
      // Fallback: scan auth.users via admin API (handles case where profile doesn't exist yet)
      const { data: listData, error: listErr } = await service.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      })

      if (listErr) {
        return NextResponse.json(
          {
            error: 'ユーザーの検索に失敗しました（admin API エラー）',
            detail: listErr.message,
          },
          { status: 500 }
        )
      }

      const existing = listData?.users?.find(
        u => u.email?.toLowerCase() === email.toLowerCase()
      )

      if (!existing) {
        return NextResponse.json(
          {
            error: 'ユーザーが見つかりませんでした',
            detail: `createUser は既存エラーを返しましたが、users テーブルに ${email} が存在しません`,
          },
          { status: 500 }
        )
      }

      userId = existing.id
      existingRole = ((existing.app_metadata as { role?: string } | null)?.role) ?? existingRole
    }

    if (existingRole && existingRole !== 'partner') {
      return NextResponse.json({
        error: 'このメールアドレスは既に運営または委託先のアカウントで使用されています。パートナー登録には別のメールアドレスをご利用ください（お心当たりがない場合は招待の送り主へご連絡ください）。',
        code: 'email-in-use-by-non-partner',
      }, { status: 409 })
    }

    // Update password so the user can sign in with the new credentials
    const { error: updateErr } = await service.auth.admin.updateUserById(userId, {
      password,
      email_confirm: true,
    })
    if (updateErr) {
      return NextResponse.json(
        {
          error: 'パスワード更新に失敗しました',
          detail: updateErr.message,
        },
        { status: 500 }
      )
    }
  }

  // ── profiles 付与（中央の門）──
  // ★既存プロフィール（別メール用途＝vendor 等）があっても role/name を上書きしない＝面をまたぐ入れ替わりの構造的封鎖。
  //   partner としての本人性は下の partners.profile_id 紐づけで担保する（getPartnerByUserId）。
  const nick = (nickname ?? '').trim() || null
  const color = PARTNER_COLORS[Math.floor(Math.random() * PARTNER_COLORS.length)]
  try {
    await attachSurfaceProfile(service, { userId, email, name, role, nickname: nick, color })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, detail: 'profiles attach failed' }, { status: 500 })
  }

  // ── partners 作成/更新（role=partner）──────────────────────────────────────
  let partnerCode: string | null = null
  if (role === 'partner') {
    const bank = fullRegistration ? {
      bank_name: (bankName ?? '').trim(),
      branch_name: (branchName ?? '').trim(),
      account_type: (accountType ?? '').trim(),
      account_number: (accountNumber ?? '').trim(),
      account_holder: (accountHolder ?? '').trim(),
    } : null
    const nowIso = new Date().toISOString()
    // A1: フロンティア判定は招待レコード（invites.is_frontier）を真実とする。
    // URLパラメータ（?role=frontier）はメールの素のリンクでは失われるため補助扱い（後方互換で OR）。
    const isFrontierInvite = (invite as { is_frontier?: boolean }).is_frontier === true || frontierFlag === true
    const frontierFields: Record<string, unknown> = {}
    if (isFrontierInvite) frontierFields.is_frontier = true
    if (typeof frontierId === 'string' && frontierId) {
      frontierFields.frontier_id = frontierId
      frontierFields.frontier_linked_at = nowIso
    }
    const partnerFields = fullRegistration ? {
      tax_type: taxType,
      bank,
      phone: (phone ?? '').trim() || null,
      address: (address ?? '').trim() || null,
      invoice_number: (invoiceNumber ?? '').trim() || null,
      terms_agreed_at: agreeTerms ? nowIso : null,
      privacy_agreed_at: agreePrivacy ? nowIso : null,
      ...frontierFields,
    } : { ...frontierFields }

    const { data: existingPartner } = await service
      .from('partners').select('id, code').eq('profile_id', userId).maybeSingle()

    if (!existingPartner) {
      let code = generatePartnerCode(name)
      const { data: conflict } = await service
        .from('partners').select('id').eq('code', code).maybeSingle()
      if (conflict) code = generatePartnerCode(name)
      partnerCode = code

      const { error: partnerErr } = await service.from('partners').insert({
        profile_id: userId, code, status: 'active',
        tax_type: 'individual',
        ...partnerFields,
      })
      if (partnerErr) {
        return NextResponse.json({ error: partnerErr.message, detail: 'partners insert failed' }, { status: 500 })
      }
    } else {
      partnerCode = existingPartner.code
      if (fullRegistration) {
        await service.from('partners').update(partnerFields).eq('id', existingPartner.id)
      }
    }

    // Terms: 同意した規約バージョンを記録（terms_version 列が未追加(DDL前)でも登録を壊さない best-effort）。
    if (agreeTerms) {
      try {
        const { TERMS_VERSION } = await import('@/lib/legal/terms')
        await service.from('partners').update({ terms_version: TERMS_VERSION }).eq('profile_id', userId)
      } catch { /* 列未追加 等は無視 */ }
    }
  }

  // ── 招待を使用済みにマーク ────────────────────────────────────────────────
  await service
    .from('invites')
    .update({ used_at: new Date().toISOString(), name })
    .eq('token', token)

  // D: 配下パートナーの参加をフロンティアへメール通知（?f= 紐づけ時のみ・best-effort）。
  try {
    if (role === 'partner' && typeof frontierId === 'string' && frontierId) {
      const { data: fp } = await service.from('partners').select('profile_id').eq('id', frontierId).single()
      const { data: fpr } = fp?.profile_id
        ? await service.from('profiles').select('name, email').eq('id', fp.profile_id).single()
        : { data: null }
      if (fpr?.email) {
        const { sendTemplatedEmail } = await import('@/lib/mail-send')
        await sendTemplatedEmail({
          key: 'frontier-joined', to: fpr.email, toRole: 'partner',
          vars: { name: fpr.name ?? 'フロンティア', partner: name, link: 'https://mb-partners.app/app/frontier' },
          buttons: [{ label: 'ダッシュボードを見る', url: 'https://mb-partners.app/app/frontier' }],
        })
      }
    }
  } catch { /* best-effort */ }

  // Batch B ③: パートナー参加（招待リンク経由の登録完了）を運営へ通知。best-effort（登録完了は阻害しない）。
  try {
    const { sendSlack, sendOpsEmail } = await import('@/lib/notify')
    const roleLabel = role === 'partner'
      ? ((invite as { is_frontier?: boolean }).is_frontier === true || frontierFlag === true ? 'パートナー（フロンティア）' : 'パートナー')
      : role
    await sendSlack(`🎉 パートナー参加: ${name}（${roleLabel}${partnerCode ? ` / ${partnerCode}` : ''}）`)
    await sendOpsEmail(
      `【MB Partners】パートナー参加: ${name}`,
      `招待リンク経由で登録が完了しました。\n・お名前：${name}\n・メール：${email}\n・区分：${roleLabel}${partnerCode ? `\n・コード：${partnerCode}` : ''}`,
    )
  } catch { /* best-effort */ }

  return NextResponse.json({ ok: true, code: partnerCode }, { status: 200 })
}
