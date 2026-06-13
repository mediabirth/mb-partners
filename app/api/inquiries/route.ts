import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: partner } = await supabase
    .from('partners')
    .select('id')
    .eq('profile_id', user.id)
    .single()
  if (!partner) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: inquiries, error } = await supabase
    .from('inquiries')
    .select(`
      id, category, subject, status, created_at, updated_at,
      inquiry_messages(id, body, sender_role, created_at)
    `)
    .eq('partner_id', partner.id)
    .order('updated_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Attach latest message to each inquiry
  const list = (inquiries ?? []).map((inq: any) => {
    const msgs = (inq.inquiry_messages ?? []).sort(
      (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
    return { ...inq, latest_message: msgs[0] ?? null, inquiry_messages: undefined }
  })

  return NextResponse.json({ inquiries: list })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: partner } = await supabase
    .from('partners')
    .select('id')
    .eq('profile_id', user.id)
    .single()
  if (!partner) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { category, subject, body: messageBody } = body

  if (!category || !subject || !messageBody) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Create inquiry
  const { data: inquiry, error: inqError } = await supabase
    .from('inquiries')
    .insert({ partner_id: partner.id, category, subject })
    .select('id')
    .single()

  if (inqError || !inquiry) {
    return NextResponse.json({ error: inqError?.message ?? 'Failed to create inquiry' }, { status: 500 })
  }

  // Create first message
  const { error: msgError } = await supabase
    .from('inquiry_messages')
    .insert({
      inquiry_id: inquiry.id,
      sender_role: 'partner',
      body: messageBody,
      created_by: user.id,
    })

  if (msgError) {
    return NextResponse.json({ error: msgError.message }, { status: 500 })
  }

  return NextResponse.json({ inquiry: { id: inquiry.id } }, { status: 201 })
}
