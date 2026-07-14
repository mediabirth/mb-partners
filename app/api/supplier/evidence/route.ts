/**
 * 売上エビデンス（サプライヤー本人・任意・ベンダー純化P2 vendor-redesign.md §3(a)）。
 * POST  multipart: deal_id, file, label? — 自社メニューの案件のみ。private bucket deal-evidence へサーバ保存。
 * GET   ?deal_id=  — 自社案件の添付一覧（メタのみ）
 * GET   ?id=       — 短期署名URL（60秒・バケットは非公開のまま）
 * ★面公開ゼロ: 本APIはサプライヤー本人の自社案件のみ。一般パートナー/受託者面には一切露出しない。
 * ★money非接触: 添付は記録のみで請求・報酬計算に影響しない。
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
const BUCKET = 'deal-evidence'

async function requireSupplier() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: p } = await supabase.from('partners').select('id, code, supplier_rate_card, company_name, profiles(name)').eq('profile_id', user.id).maybeSingle()
  if (!p) return null
  const admin = await createServiceRoleClient()
  if (!p.supplier_rate_card) {
    const { data: sv } = await admin.from('services').select('id').eq('supplier_partner_id', p.id).limit(1)
    if (!sv?.length) return null
  }
  return { partnerId: p.id, name: (p as { company_name?: string | null }).company_name || (p.profiles as { name?: string } | null)?.name || p.code }
}

async function ownDeal(admin: Awaited<ReturnType<typeof createServiceRoleClient>>, partnerId: string, dealId: string) {
  const { data: dl } = await admin.from('deals').select('id, service_id').eq('id', dealId).maybeSingle()
  if (!dl) return false
  const { data: sv } = await admin.from('services').select('id').eq('id', dl.service_id as string).eq('supplier_partner_id', partnerId).maybeSingle()
  return !!sv
}

export async function GET(req: NextRequest) {
  const me = await requireSupplier()
  if (!me) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const admin = await createServiceRoleClient()
  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  if (id) {
    const { data: row } = await admin.from('deal_evidences').select('id, deal_id, path').eq('id', id).maybeSingle()
    if (!row || !(await ownDeal(admin, me.partnerId, row.deal_id))) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const { data: signed, error } = await admin.storage.from(BUCKET).createSignedUrl(row.path, 60)
    if (error || !signed) return NextResponse.json({ error: error?.message ?? '署名URLの発行に失敗しました' }, { status: 500 })
    return NextResponse.json({ url: signed.signedUrl, expiresIn: 60 })
  }
  const dealId = url.searchParams.get('deal_id')
  if (!dealId) return NextResponse.json({ error: 'deal_id または id が必要です' }, { status: 400 })
  if (!(await ownDeal(admin, me.partnerId, dealId))) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { data } = await admin.from('deal_evidences').select('id, label, created_at').eq('deal_id', dealId).order('created_at', { ascending: false })
  return NextResponse.json({ evidences: data ?? [] })
}

export async function POST(req: NextRequest) {
  const me = await requireSupplier()
  if (!me) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const admin = await createServiceRoleClient()
  const form = await req.formData()
  const dealId = String(form.get('deal_id') ?? '').trim()
  const label = String(form.get('label') ?? '').trim().slice(0, 120) || null
  const file = form.get('file')
  if (!dealId) return NextResponse.json({ error: 'deal_id required' }, { status: 400 })
  if (!file || typeof file === 'string' || (file as File).size === 0) return NextResponse.json({ error: 'ファイルを選択してください' }, { status: 400 })
  if ((file as File).size > 20 * 1024 * 1024) return NextResponse.json({ error: 'ファイルは20MBまでです' }, { status: 400 })
  if (!(await ownDeal(admin, me.partnerId, dealId))) return NextResponse.json({ error: '自社メニューの案件のみ添付できます' }, { status: 403 })

  const f = file as File
  const safeName = (f.name || 'evidence').replace(/[^\w.\-]+/g, '_').slice(-80)
  const path = `${dealId}/${crypto.randomUUID()}-${safeName}`
  const buf = new Uint8Array(await f.arrayBuffer())
  const { error: upErr } = await admin.storage.from(BUCKET).upload(path, buf, { contentType: f.type || 'application/octet-stream', upsert: false })
  if (upErr) return NextResponse.json({ error: `アップロード失敗: ${upErr.message}` }, { status: 500 })
  const { data, error } = await admin.from('deal_evidences').insert({ deal_id: dealId, uploaded_by_partner_id: me.partnerId, path, label: label ?? safeName }).select('id, label, created_at').single()
  if (error) { await admin.storage.from(BUCKET).remove([path]).catch(() => {}); return NextResponse.json({ error: error.message }, { status: 500 }) }
  try { await admin.from('audit_logs').insert({ actor_profile_id: null, actor_name: `サプライヤー本人（${me.name}）`, category: 'supplier_self', target: `deal-evidence:${data.id}`, action: 'update', meta: { deal_id: dealId, label: data.label } }) } catch { /* best-effort */ }
  return NextResponse.json({ evidence: data })
}
