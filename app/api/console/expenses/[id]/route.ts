/**
 * 経費申請 個別操作（owner/manager）。
 * PATCH  /api/console/expenses/[id]  — 承認/却下（status: approved/rejected/submitted）。承認済のみP&Lに反映。
 * DELETE /api/console/expenses/[id]  — 削除（添付ファイルも掃除）。
 * いずれも reward/payout/凍結 には触れない（経費はP&L読取専用の別ストリーム）。
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'

const STATUSES = ['submitted', 'approved', 'rejected']

async function requireWrite(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['owner', 'manager', 'admin'].includes(profile.role)) return null
  return user
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const user = await requireWrite(supabase)
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const b = await req.json()
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof b.kind === 'string') patch.kind = b.kind.trim().slice(0, 40)
  if ('amount' in b) patch.amount = Math.max(0, Math.round(Number(b.amount) || 0))
  if ('note' in b) patch.note = b.note ? String(b.note).trim().slice(0, 500) : null
  if (typeof b.status === 'string' && STATUSES.includes(b.status)) {
    patch.status = b.status
    if (b.status === 'approved') { patch.approved_by = user.id; patch.approved_at = new Date().toISOString() }
    else { patch.approved_by = null; patch.approved_at = null }  // 却下/差戻しは承認情報をクリア
  }
  const admin = await createServiceRoleClient()
  const { data, error } = await admin.from('expense_claims').update(patch).eq('id', id).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ expense: data })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  if (!(await requireWrite(supabase))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const admin = await createServiceRoleClient()
  const { data: row } = await admin.from('expense_claims').select('evidence_path').eq('id', id).single()
  const { error } = await admin.from('expense_claims').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (row?.evidence_path) await admin.storage.from('expense-evidence').remove([row.evidence_path]).catch(() => {})
  return NextResponse.json({ ok: true })
}
