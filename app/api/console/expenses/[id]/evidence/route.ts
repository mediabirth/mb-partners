/**
 * 領収書プレビュー — 短期の署名付きURLを発行（バケットは非公開のまま）。
 * GET /api/console/expenses/[id]/evidence  → { url, expiresIn }
 * owner/manager のみ。サーバ(service_role)が60秒の signed URL を発行してリダイレクトせず返す。
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'

async function requireRead(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  return !!profile && profile.role !== 'partner'
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  if (!(await requireRead(supabase))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const admin = await createServiceRoleClient()
  const { data: row, error } = await admin.from('expense_claims').select('evidence_path').eq('id', id).single()
  if (error || !row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!row.evidence_path) return NextResponse.json({ error: '領収書が添付されていません' }, { status: 404 })
  const { data: signed, error: sErr } = await admin.storage.from('expense-evidence').createSignedUrl(row.evidence_path, 60)
  if (sErr || !signed) return NextResponse.json({ error: sErr?.message ?? '署名URLの発行に失敗しました' }, { status: 500 })
  return NextResponse.json({ url: signed.signedUrl, expiresIn: 60 })
}
