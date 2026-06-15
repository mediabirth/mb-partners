import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'edge'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role === 'partner' || !profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const body = await req.json()

  // R2-B: フロンティア役割／紐づけの更新
  if ('is_frontier' in body || 'frontier_id' in body) {
    const patch: Record<string, unknown> = {}
    if ('is_frontier' in body) patch.is_frontier = !!body.is_frontier
    if ('frontier_id' in body) {
      const fid = body.frontier_id || null
      if (fid === id) return NextResponse.json({ error: '自分自身をフロンティアに設定できません' }, { status: 400 })
      patch.frontier_id = fid
      patch.frontier_linked_at = fid ? new Date().toISOString() : null  // 設定時に記録／解除でクリア
    }
    const { error } = await supabase.from('partners').update(patch).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // 既存: ステータス更新
  const { status } = body
  const allowed = ['active', 'suspended', 'pending']
  if (!allowed.includes(status)) return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  const { error } = await supabase.from('partners').update({ status }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
