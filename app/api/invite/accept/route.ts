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

const PARTNER_COLORS = ['#4733E6', '#C2479E', '#15917E', '#D98914', '#E64733', '#9333EA']

function generatePartnerCode(name: string): string {
  const upper = name.trim().toUpperCase().replace(/[^A-Z]/g, '')
  const prefix = upper.length >= 2 ? upper.slice(0, 2) : ('ZZ' + upper).slice(-2)
  return prefix + Math.floor(1000 + Math.random() * 9000)
}

export const runtime = 'edge'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { token, name, email: clientEmail, password } = body

  if (!token)        return NextResponse.json({ error: 'token は必須です' }, { status: 400 })
  if (!name?.trim()) return NextResponse.json({ error: 'name は必須です' }, { status: 400 })
  if (!password || password.length < 8) {
    return NextResponse.json({ error: 'パスワードは8文字以上で設定してください' }, { status: 400 })
  }

  const service = await createServiceRoleClient()

  // ── 招待トークン検証 ──────────────────────────────────────────────────────
  const { data: invite, error: inviteErr } = await service
    .from('invites')
    .select('id, email, role, expires_at, used_at')
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
      .select('id')
      .ilike('email', email)   // case-insensitive match
      .maybeSingle()

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

  // ── profiles 作成（未作成の場合のみ）──────────────────────────────────────
  const { data: existingProfile } = await service
    .from('profiles').select('id').eq('id', userId).maybeSingle()

  if (!existingProfile) {
    const color = PARTNER_COLORS[Math.floor(Math.random() * PARTNER_COLORS.length)]
    const { error: profErr } = await service.from('profiles').insert({
      id:    userId,
      name:  name.trim(),
      role,
      email,
      color,
    })
    if (profErr) {
      return NextResponse.json({ error: profErr.message, detail: 'profiles insert failed' }, { status: 500 })
    }
  }

  // ── partners 作成（role=partner かつ未作成の場合）──────────────────────────
  if (role === 'partner') {
    const { data: existingPartner } = await service
      .from('partners').select('id').eq('profile_id', userId).maybeSingle()

    if (!existingPartner) {
      let code = generatePartnerCode(name.trim())
      const { data: conflict } = await service
        .from('partners').select('id').eq('code', code).maybeSingle()
      if (conflict) code = generatePartnerCode(name.trim())

      const { error: partnerErr } = await service.from('partners').insert({
        profile_id: userId,
        code,
        status:     'active',
        tax_type:   'individual',
      })
      if (partnerErr) {
        return NextResponse.json({ error: partnerErr.message, detail: 'partners insert failed' }, { status: 500 })
      }
    }
  }

  // ── 招待を使用済みにマーク ────────────────────────────────────────────────
  await service
    .from('invites')
    .update({ used_at: new Date().toISOString(), name: name.trim() })
    .eq('token', token)

  return NextResponse.json({ ok: true }, { status: 200 })
}
