import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'edge'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role === 'partner' || !profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { name, subtitle, description, who, url, active, logo_path, icon, color, target_audience, image_url, category } = body
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })

  // 協力はメニュー単位（service_menus.coop_*）に一本化。サービス単位 coop_* は廃止。
  // target_audience/image_url/category はPATCH側 allowed と整合（新規作成で入力が捨てられないように受理）。
  const { data: service, error } = await supabase
    .from('services')
    .insert({
      name,
      subtitle:       subtitle       || null,
      description:    description    || null,
      who:            who            || null,
      url:            url            || null,
      active:         active         ?? true,
      logo_path:      logo_path      || null,
      icon:           icon           || 'arrows',
      color:          color          || '#4733e6',
      target_audience: target_audience || null,
      image_url:      image_url      || null,
      category:       category       || null,
      sort:           99,
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ service })
}
