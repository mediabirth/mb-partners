import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'owner') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: broadcasts, error } = await supabase
    .from('broadcasts')
    .select('id, kind, title, body, hero_path, segment, sent_at, created_at')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Fetch read counts for each broadcast
  const ids = (broadcasts ?? []).map(b => b.id)
  let readCounts: Record<string, number> = {}
  if (ids.length > 0) {
    const { data: reads } = await supabase
      .from('broadcast_reads')
      .select('broadcast_id')
      .in('broadcast_id', ids)

    if (reads) {
      for (const r of reads) {
        readCounts[r.broadcast_id] = (readCounts[r.broadcast_id] ?? 0) + 1
      }
    }
  }

  const result = (broadcasts ?? []).map(b => ({
    ...b,
    read_count: readCounts[b.id] ?? 0,
  }))

  return NextResponse.json({ broadcasts: result })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'owner') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { kind, title, body: bodyText, hero_path, body_images, segment } = body

  if (!kind || !title) {
    return NextResponse.json({ error: 'kind and title are required' }, { status: 400 })
  }

  const serviceSupabase = await createServiceRoleClient()
  const { data: broadcast, error } = await serviceSupabase
    .from('broadcasts')
    .insert({
      kind,
      title,
      body: bodyText ?? null,
      hero_path: hero_path ?? null,
      body_images: body_images ?? null,
      segment: segment ?? 'all',
      created_by: user.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ broadcast }, { status: 201 })
}
