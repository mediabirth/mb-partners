import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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

  const { data: inquiries, error } = await supabase
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
