import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'edge'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ pendingPartners: 0, openInquiries: 0 })

  const [{ count: pendingPartners }, { count: openInquiries }] = await Promise.all([
    supabase.from('partners').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('inquiries').select('id', { count: 'exact', head: true }).eq('status', 'open'),
  ])

  return NextResponse.json({
    pendingPartners: pendingPartners ?? 0,
    openInquiries:   openInquiries  ?? 0,
  })
}
