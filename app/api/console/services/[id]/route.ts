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
  // 協力はメニュー単位に一本化（services の coop_* は廃止）。coverage_steps/ft_* は当面残置だが編集対象外。
  const allowed = ['name', 'subtitle', 'icon', 'color', 'description', 'who', 'url', 'active', 'logo_path', 'sort', 'calendar_account_id', 'calendar_member_id']
  const patch: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) patch[key] = body[key]
  }
  // 段階B（旧）／段階3a：'' を null に正規化＝既定へフォールバック。
  if ('calendar_account_id' in patch) patch.calendar_account_id = patch.calendar_account_id ? String(patch.calendar_account_id) : null
  if ('calendar_member_id' in patch) patch.calendar_member_id = patch.calendar_member_id ? String(patch.calendar_member_id) : null

  const { data: service, error } = await supabase
    .from('services')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ service })
}
