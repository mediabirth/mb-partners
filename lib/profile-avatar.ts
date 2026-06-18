/**
 * F-4：プロフィール・アバターの共有ハンドラ（3サーフェス共通の作法）。
 * 本人のみ更新（auth.uid の profiles 行のみ）。avatars バケットへ service_role でアップロード。
 * ★お金系には一切触れない（profiles.avatar_url のみ更新）。各サーフェスの /api/<surface>/avatar から re-export。
 */
import { NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'

const ALLOWED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
const MAX = 5 * 1024 * 1024

export async function avatarPOST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const form = await req.formData()
  const file = form.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'file required' }, { status: 400 })
  if (!ALLOWED.includes(file.type)) return NextResponse.json({ error: '画像（png/jpeg/webp/gif）を選択してください' }, { status: 400 })
  if (file.size > MAX) return NextResponse.json({ error: '5MB以下の画像を選択してください' }, { status: 400 })

  const admin = await createServiceRoleClient()
  const ext = (file.type.split('/')[1] || 'png').replace('jpeg', 'jpg')
  const path = `${user.id}/avatar-${Date.now()}.${ext}`   // 本人フォルダ(<uid>/...)＝RLSと一致
  const buf = new Uint8Array(await file.arrayBuffer())
  const up = await admin.storage.from('avatars').upload(path, buf, { contentType: file.type, upsert: true })
  if (up.error) return NextResponse.json({ error: up.error.message, needsBucket: true }, { status: 200 })

  const { data: { publicUrl } } = admin.storage.from('avatars').getPublicUrl(path)
  // 本人のみ：auth.uid の profiles 行だけを更新（お金関連列には触れない）
  const { error } = await admin.from('profiles').update({ avatar_url: publicUrl }).eq('id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ avatar_url: publicUrl })
}

export async function avatarDELETE() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const admin = await createServiceRoleClient()
  const { error } = await admin.from('profiles').update({ avatar_url: null }).eq('id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ avatar_url: null })
}
