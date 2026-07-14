/**
 * 案件の売上エビデンス（コンソール owner/manager・ベンダー純化P2 vendor-redesign.md §3(a)）。
 * GET    — 添付一覧（メタのみ）／ ?ev= 指定で短期署名URL（60秒）
 * POST   multipart: file, label? — 運営側の添付口
 * DELETE body { evidence_id } — 誤添付のやり直し（ファイルも掃除・audit記録）
 * ★面公開ゼロ: console のみ。★money非接触: 記録のみで請求・報酬計算に影響しない。
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
const BUCKET = 'deal-evidence'

async function requireWrite(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('role, name').eq('id', user.id).single()
  if (!profile || !['owner', 'manager', 'admin'].includes(profile.role)) return null
  return { id: user.id, name: profile.name as string | null }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  if (!(await requireWrite(supabase))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const admin = await createServiceRoleClient()
  const ev = new URL(req.url).searchParams.get('ev')
  if (ev) {
    const { data: row } = await admin.from('deal_evidences').select('path').eq('id', ev).eq('deal_id', id).maybeSingle()
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const { data: signed, error } = await admin.storage.from(BUCKET).createSignedUrl(row.path, 60)
    if (error || !signed) return NextResponse.json({ error: error?.message ?? '署名URLの発行に失敗しました' }, { status: 500 })
    return NextResponse.json({ url: signed.signedUrl, expiresIn: 60 })
  }
  const { data } = await admin.from('deal_evidences').select('id, label, uploaded_by_partner_id, created_at').eq('deal_id', id).order('created_at', { ascending: false })
  return NextResponse.json({ evidences: data ?? [] })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const actor = await requireWrite(supabase)
  if (!actor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const admin = await createServiceRoleClient()
  const { data: dl } = await admin.from('deals').select('id').eq('id', id).maybeSingle()
  if (!dl) return NextResponse.json({ error: 'Deal not found' }, { status: 404 })
  const form = await req.formData()
  const label = String(form.get('label') ?? '').trim().slice(0, 120) || null
  const file = form.get('file')
  if (!file || typeof file === 'string' || (file as File).size === 0) return NextResponse.json({ error: 'ファイルを選択してください' }, { status: 400 })
  if ((file as File).size > 20 * 1024 * 1024) return NextResponse.json({ error: 'ファイルは20MBまでです' }, { status: 400 })
  const f = file as File
  const safeName = (f.name || 'evidence').replace(/[^\w.\-]+/g, '_').slice(-80)
  const path = `${id}/${crypto.randomUUID()}-${safeName}`
  const buf = new Uint8Array(await f.arrayBuffer())
  const { error: upErr } = await admin.storage.from(BUCKET).upload(path, buf, { contentType: f.type || 'application/octet-stream', upsert: false })
  if (upErr) return NextResponse.json({ error: `アップロード失敗: ${upErr.message}` }, { status: 500 })
  const { data, error } = await admin.from('deal_evidences').insert({ deal_id: id, uploaded_by_profile_id: actor.id, path, label: label ?? safeName }).select('id, label, created_at').single()
  if (error) { await admin.storage.from(BUCKET).remove([path]).catch(() => {}); return NextResponse.json({ error: error.message }, { status: 500 }) }
  return NextResponse.json({ evidence: data })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const actor = await requireWrite(supabase)
  if (!actor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const b = await req.json().catch(() => ({}))
  const evId = typeof b.evidence_id === 'string' ? b.evidence_id : ''
  if (!evId) return NextResponse.json({ error: 'evidence_id required' }, { status: 400 })
  const admin = await createServiceRoleClient()
  const { data: row } = await admin.from('deal_evidences').select('id, path, label').eq('id', evId).eq('deal_id', id).maybeSingle()
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await admin.storage.from(BUCKET).remove([row.path]).catch(() => {})
  const { error } = await admin.from('deal_evidences').delete().eq('id', evId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  try { await admin.from('audit_logs').insert({ actor_profile_id: actor.id, actor_name: actor.name ?? '運営', category: 'deal_evidence', target: `deal-evidence:${evId}`, action: 'delete', meta: { deal_id: id, label: row.label } }) } catch { /* best-effort */ }
  return NextResponse.json({ ok: true })
}
