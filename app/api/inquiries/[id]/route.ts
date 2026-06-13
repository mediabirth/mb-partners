import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: partner } = await supabase
    .from('partners')
    .select('id')
    .eq('profile_id', user.id)
    .single()
  if (!partner) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: inquiry, error } = await supabase
    .from('inquiries')
    .select(`
      id, category, subject, status, created_at, updated_at,
      inquiry_messages(id, body, sender_role, created_at, created_by)
    `)
    .eq('id', id)
    .eq('partner_id', partner.id)
    .single()

  if (error || !inquiry) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const messages = ((inquiry as any).inquiry_messages ?? []).sort(
    (a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )

  return NextResponse.json({ inquiry: { ...inquiry, inquiry_messages: messages } })
}
