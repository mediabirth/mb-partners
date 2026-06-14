import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { createNotification } from '@/lib/notifications'

export const runtime = 'edge'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'owner') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: inquiry, error } = await supabase
    .from('inquiries')
    .select(`
      id, category, subject, status, created_at, updated_at, partner_id,
      partners(id, code, profiles(name, color)),
      inquiry_messages(id, body, sender_role, created_at, created_by)
    `)
    .eq('id', id)
    .single()

  if (error || !inquiry) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const messages = ((inquiry as any).inquiry_messages ?? []).sort(
    (a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )

  return NextResponse.json({ inquiry: { ...inquiry, inquiry_messages: messages } })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'owner') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { body: messageBody } = body
  if (!messageBody) return NextResponse.json({ error: 'Missing body' }, { status: 400 })

  // Get inquiry for partner_id and subject
  const { data: inquiry } = await supabase
    .from('inquiries')
    .select('id, partner_id, subject')
    .eq('id', id)
    .single()
  if (!inquiry) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Insert message
  const { data: message, error: msgError } = await supabase
    .from('inquiry_messages')
    .insert({
      inquiry_id: id,
      sender_role: 'owner',
      sender_profile_id: user.id,
      body: messageBody,
      created_by: user.id,
    })
    .select('id, body, sender_role, created_at')
    .single()

  if (msgError) return NextResponse.json({ error: msgError.message }, { status: 500 })

  // Update inquiry status to 'replied' and updated_at
  await supabase
    .from('inquiries')
    .update({ status: 'replied', updated_at: new Date().toISOString() })
    .eq('id', id)

  // Notify partner
  const serviceSupabase = await createServiceRoleClient()
  await createNotification(
    serviceSupabase,
    (inquiry as any).partner_id,
    'お問い合わせに返信がありました',
    (inquiry as any).subject,
    { type: 'inquiry_reply', inquiry_id: id },
  )

  return NextResponse.json({ message }, { status: 201 })
}
