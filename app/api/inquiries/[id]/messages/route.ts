import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'edge'

export async function POST(
  req: NextRequest,
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

  // Verify inquiry belongs to partner
  const { data: inquiry } = await supabase
    .from('inquiries')
    .select('id')
    .eq('id', id)
    .eq('partner_id', partner.id)
    .single()
  if (!inquiry) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const { body: messageBody } = body
  if (!messageBody) return NextResponse.json({ error: 'Missing body' }, { status: 400 })

  const { data: message, error } = await supabase
    .from('inquiry_messages')
    .insert({
      inquiry_id: id,
      sender_role: 'partner',
      sender_profile_id: user.id,
      body: messageBody,
      created_by: user.id,
    })
    .select('id, body, sender_role, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Update inquiry updated_at
  await supabase
    .from('inquiries')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', id)

  return NextResponse.json({ message }, { status: 201 })
}
