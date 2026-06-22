import { NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'

export const runtime = 'edge'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'owner') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // B4: nested partners.profiles は profiles RLS（本人のみSELECT）で owner セッションでは null → 送信者名が「−」化。
  // 認証/権限ゲートは anon(supabase) のまま。氏名解決のための一覧読取のみ service role（上で owner 確認済）。
  const admin = await createServiceRoleClient()
  const { data: inquiries, error } = await admin
    .from('inquiries')
    .select(`
      id, category, subject, status, created_at, updated_at,
      partners(id, code, profiles(name, color)),
      inquiry_messages(id, body, sender_role, created_at)
    `)
    .order('updated_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const list = (inquiries ?? []).map((inq: any) => {
    const msgs = (inq.inquiry_messages ?? []).sort(
      (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
    return { ...inq, latest_message: msgs[0] ?? null, inquiry_messages: undefined }
  })

  const openCount = list.filter((inq: any) => inq.status === 'open').length

  return NextResponse.json({ inquiries: list, openCount })
}
