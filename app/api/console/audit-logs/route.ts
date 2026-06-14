import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'edge'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ logs: [] }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const category = searchParams.get('category')

  let query = supabase
    .from('audit_logs')
    .select('id, actor_name, category, target, action, created_at')
    .order('created_at', { ascending: false })
    .limit(50)

  if (category) query = query.eq('category', category)

  const { data: logs } = await query
  return NextResponse.json({ logs: logs ?? [] })
}
