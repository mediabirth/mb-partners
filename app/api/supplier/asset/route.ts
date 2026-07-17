/**
 * サプライヤーのブランド画像アップロード（完全等価化A）。
 * POST multipart: service_id, kind('logo'|'image'), file — 自社ブランドのみ。MBと同一の service-logos バケットへサーバ経由で保存。
 * 返り値: logo→{ path }（services.logo_path 用・申請の value に使う）／image→{ url }（image_url 用）。
 * ★アップロード自体は表示に出ない（申請が承認されて初めて反映）＝二層原則を維持。
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { data: p } = await supabase.from('partners').select('id, supplier_rate_card').eq('profile_id', user.id).maybeSingle()
  if (!p) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const admin = await createServiceRoleClient()
  if (!p.supplier_rate_card) {
    const { data: sv } = await admin.from('services').select('id').eq('supplier_partner_id', p.id).limit(1)
    if (!sv?.length) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const form = await req.formData()
  const serviceId = String(form.get('service_id') ?? '')
  const kind = String(form.get('kind') ?? '') === 'logo' ? 'logo' : 'image'
  const file = form.get('file')
  if (!serviceId) return NextResponse.json({ error: 'service_id required' }, { status: 400 })
  const { data: own } = await admin.from('services').select('id').eq('id', serviceId).eq('supplier_partner_id', p.id).maybeSingle()
  if (!own) return NextResponse.json({ error: '自社ブランドのみアップロードできます' }, { status: 403 })
  if (!file || typeof file === 'string' || (file as File).size === 0) return NextResponse.json({ error: 'ファイルを選択してください' }, { status: 400 })
  if ((file as File).size > 5 * 1024 * 1024) return NextResponse.json({ error: '画像は5MBまでです' }, { status: 400 })
  if (!/^image\//.test((file as File).type)) return NextResponse.json({ error: '画像ファイルを選択してください' }, { status: 400 })
  const f = file as File
  const ext = (f.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'png'
  const path = `supplier/${serviceId}/${kind}-${crypto.randomUUID()}.${ext}`
  const buf = new Uint8Array(await f.arrayBuffer())
  const { error } = await admin.storage.from('service-logos').upload(path, buf, { contentType: f.type, upsert: false })
  if (error) return NextResponse.json({ error: `アップロード失敗: ${error.message}` }, { status: 500 })
  const { data: pub } = admin.storage.from('service-logos').getPublicUrl(path)
  return NextResponse.json(kind === 'logo' ? { path, url: pub.publicUrl } : { url: pub.publicUrl, path })
}
