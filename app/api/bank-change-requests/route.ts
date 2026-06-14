/**
 * POST /api/bank-change-requests
 * パートナーが口座変更を申請する（公開は不可、要ログイン）
 *
 * body: { bank_name, branch_name, account_type, account_number, account_holder }
 *
 * - 既存の partners.bank をスナップショットして before_bank に保存
 * - pending なレコードが既にある場合は 409
 * - 申請後にオーナー/マネージャーへ通知
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { createNotification } from '@/lib/notifications'

export const runtime = 'edge'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = await createServiceRoleClient()

  // パートナーレコードを取得
  const { data: partner } = await service
    .from('partners')
    .select('id, bank')
    .eq('profile_id', user.id)
    .single()
  if (!partner) return NextResponse.json({ error: 'Partner not found' }, { status: 404 })

  // 既に pending な申請がある場合はブロック
  const { data: existing } = await service
    .from('bank_change_requests')
    .select('id')
    .eq('partner_id', partner.id)
    .eq('status', 'pending')
    .maybeSingle()
  if (existing) {
    return NextResponse.json({ error: '承認待ちの申請がすでにあります' }, { status: 409 })
  }

  const body = await req.json()
  const { bank_name, branch_name, account_type, account_number, account_holder } = body

  if (!bank_name?.trim() || !branch_name?.trim() || !account_type?.trim()
    || !account_number?.trim() || !account_holder?.trim()) {
    return NextResponse.json({ error: '全項目を入力してください' }, { status: 400 })
  }

  const new_bank = {
    bank_name:      bank_name.trim(),
    branch_name:    branch_name.trim(),
    account_type:   account_type.trim(),
    account_number: account_number.trim(),
    account_holder: account_holder.trim(),
  }

  const { data: created, error } = await service
    .from('bank_change_requests')
    .insert({
      partner_id:  partner.id,
      before_bank: partner.bank ?? null,
      new_bank,
      status:      'pending',
    })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // オーナー/マネージャーへ通知（partner レコードを持つ管理者のみ）
  const { data: adminProfiles } = await service
    .from('profiles')
    .select('id')
    .in('role', ['owner', 'manager'])

  if (adminProfiles && adminProfiles.length > 0) {
    const adminIds = adminProfiles.map(p => p.id)
    const { data: adminPartners } = await service
      .from('partners')
      .select('id')
      .in('profile_id', adminIds)

    for (const ap of adminPartners ?? []) {
      await createNotification(
        service,
        ap.id,
        '口座変更申請が届きました',
        '新しい口座変更申請を確認してください。',
        { type: 'bank_change_request', id: created.id },
      )
    }
  }

  return NextResponse.json({ id: created.id }, { status: 201 })
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = await createServiceRoleClient()

  const { data: partner } = await service
    .from('partners')
    .select('id')
    .eq('profile_id', user.id)
    .single()
  if (!partner) return NextResponse.json({ requests: [] })

  const { data: requests } = await service
    .from('bank_change_requests')
    .select('id, before_bank, new_bank, status, reject_reason, created_at, reviewed_at')
    .eq('partner_id', partner.id)
    .order('created_at', { ascending: false })

  return NextResponse.json({ requests: requests ?? [] })
}
