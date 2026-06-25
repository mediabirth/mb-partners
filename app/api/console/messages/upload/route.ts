import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'

// メッセージセンター Phase3-A：送信用画像アップロード（owner gate）。message-attachments 私設バケットへ保存し path を返す。
// ★画像のみ・サイズ上限。money/deals/帰属 非接触。例外安全。
export const runtime = 'nodejs'

const BUCKET = 'message-attachments'
const MAX_BYTES = 8 * 1024 * 1024 // 8MB（LINE image 上限内）

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'owner') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const b = await req.json().catch(() => ({}))
    const contentBase64 = typeof b.contentBase64 === 'string' ? b.contentBase64.replace(/^data:[^;]+;base64,/, '') : ''
    const filename = typeof b.filename === 'string' ? b.filename : 'image'
    const ct = typeof b.contentType === 'string' && /^image\/(png|jpeg|jpg|gif|webp)$/.test(b.contentType) ? b.contentType : 'image/jpeg'
    if (!contentBase64) return NextResponse.json({ error: '画像がありません' }, { status: 400 })
    const buf = Buffer.from(contentBase64, 'base64')
    if (buf.length === 0) return NextResponse.json({ error: '画像が空です' }, { status: 400 })
    if (buf.length > MAX_BYTES) return NextResponse.json({ error: '画像が大きすぎます（8MBまで）' }, { status: 400 })
    const ext = ct.includes('png') ? 'png' : ct.includes('gif') ? 'gif' : ct.includes('webp') ? 'webp' : 'jpg'
    const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60)
    const stamp = Date.now()
    const path = `out/${user.id}/${stamp}-${safe}.${ext}`
    const admin = await createServiceRoleClient()
    const { error } = await admin.storage.from(BUCKET).upload(path, buf, { contentType: ct, upsert: true })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const { data: signed } = await admin.storage.from(BUCKET).createSignedUrl(path, 3600)
    return NextResponse.json({ ok: true, attachment: { type: 'image', path }, previewUrl: signed?.signedUrl ?? null })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'upload failed' }, { status: 500 })
  }
}
