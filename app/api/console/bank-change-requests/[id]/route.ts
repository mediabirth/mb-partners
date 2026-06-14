/**
 * PATCH /api/console/bank-change-requests/[id]
 * 管理者が口座変更申請を承認または却下する
 *
 * body: { action: 'approve' | 'reject', reject_reason?: string }
 *
 * ★ セキュリティ要件:
 *   - 承認時のみ partners.bank を更新する
 *   - 却下時は partners.bank を絶対に更新しない
 *   - pending 以外の申請は再操作不可（409）
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { createNotification } from '@/lib/notifications'

export const runtime = 'edge'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (!profile || !['owner', 'manager'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { action, reject_reason } = body

  if (action !== 'approve' && action !== 'reject') {
    return NextResponse.json({ error: 'action は approve または reject のみ有効です' }, { status: 400 })
  }
  if (action === 'reject' && !reject_reason?.trim()) {
    return NextResponse.json({ error: '却下理由を入力してください' }, { status: 400 })
  }

  const service = await createServiceRoleClient()

  // 申請レコード取得（pending であることを確認）
  const { data: request } = await service
    .from('bank_change_requests')
    .select('id, partner_id, new_bank, status')
    .eq('id', id)
    .single()

  if (!request) return NextResponse.json({ error: '申請が見つかりません' }, { status: 404 })
  if (request.status !== 'pending') {
    return NextResponse.json({ error: 'すでに処理済みの申請です' }, { status: 409 })
  }

  const now = new Date().toISOString()

  if (action === 'approve') {
    // ── 承認: partners.bank を更新してから申請を approved にする ──
    const { error: bankErr } = await service
      .from('partners')
      .update({ bank: request.new_bank })
      .eq('id', request.partner_id)

    if (bankErr) {
      return NextResponse.json({ error: `口座更新失敗: ${bankErr.message}` }, { status: 500 })
    }

    await service
      .from('bank_change_requests')
      .update({ status: 'approved', reviewed_by: user.id, reviewed_at: now })
      .eq('id', id)

    // パートナーへ承認通知
    await createNotification(
      service,
      request.partner_id,
      '口座変更が承認されました',
      '申請した口座情報が反映されました。',
      { type: 'bank_change_request', id },
    )
  } else {
    // ── 却下: partners.bank は絶対に更新しない ──
    await service
      .from('bank_change_requests')
      .update({
        status:        'rejected',
        reviewed_by:   user.id,
        reviewed_at:   now,
        reject_reason: reject_reason.trim(),
      })
      .eq('id', id)

    // パートナーへ却下通知
    await createNotification(
      service,
      request.partner_id,
      '口座変更が却下されました',
      `却下理由: ${reject_reason.trim()}`,
      { type: 'bank_change_request', id },
    )
  }

  return NextResponse.json({ ok: true })
}
