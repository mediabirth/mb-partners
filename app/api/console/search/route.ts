import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'edge'

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ results: [] })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role === 'partner' || !profile) return NextResponse.json({ results: [] })

  const { searchParams } = new URL(req.url)
  const q = (searchParams.get('q') ?? '').trim()
  if (!q || q.length < 2) return NextResponse.json({ results: [] })

  const [dealsRes, partnersRes, servicesRes, inquiriesRes] = await Promise.all([
    supabase
      .from('deals')
      .select('id, customer_name, status, services(name)')
      .ilike('customer_name', `%${q}%`)
      .limit(5),
    supabase
      .from('partners')
      .select('id, code, profiles(name, email)')
      .or(`code.ilike.%${q}%`)
      .limit(5),
    supabase
      .from('services')
      .select('id, name, subtitle')
      .or(`name.ilike.%${q}%,subtitle.ilike.%${q}%`)
      .limit(3),
    supabase
      .from('inquiries')
      .select('id, subject, category, status')
      .or(`subject.ilike.%${q}%,category.ilike.%${q}%`)
      .limit(3),
  ])

  // Also search partner profiles by name
  const profilesRes = await supabase
    .from('profiles')
    .select('id, name, email')
    .ilike('name', `%${q}%`)
    .limit(5)

  const results: Array<{
    type: 'deal' | 'partner' | 'service' | 'inquiry'; id: string; label: string; sub: string; href: string
  }> = []

  const STATUS: Record<string, string> = {
    received: '受付', in_progress: '対応中', confirmed: '成約・確定', paid: '支払済',
  }

  for (const d of dealsRes.data ?? []) {
    results.push({
      type: 'deal',
      id: d.id,
      label: d.customer_name,
      sub: `${(d as any).services?.name ?? ''} · ${STATUS[d.status] ?? d.status}`,
      href: '/console/deals',
    })
  }

  // Get partner IDs from profile search
  const profileIds = (profilesRes.data ?? []).map(p => p.id)
  if (profileIds.length > 0) {
    const partnersByProfile = await supabase
      .from('partners')
      .select('id, code, profiles(name, email)')
      .in('profile_id', profileIds)
      .limit(5)
    for (const p of partnersByProfile.data ?? []) {
      results.push({
        type: 'partner',
        id: p.id,
        label: (p as any).profiles?.name ?? p.code,
        sub: `${p.code} · ${(p as any).profiles?.email ?? ''}`,
        href: `/console/partners/${p.id}`,
      })
    }
  }

  for (const p of partnersRes.data ?? []) {
    if (!results.find(r => r.id === p.id)) {
      results.push({
        type: 'partner',
        id: p.id,
        label: (p as any).profiles?.name ?? p.code,
        sub: `${p.code} · ${(p as any).profiles?.email ?? ''}`,
        href: `/console/partners/${p.id}`,
      })
    }
  }

  for (const s of servicesRes.data ?? []) {
    results.push({
      type: 'service',
      id: s.id,
      label: s.name,
      sub: s.subtitle ?? '',
      href: '/console/services',
    })
  }

  for (const inq of inquiriesRes.data ?? []) {
    results.push({
      type: 'inquiry',
      id: inq.id,
      label: inq.subject ?? '—',
      sub: `${inq.category ?? ''} · ${inq.status === 'open' ? '未対応' : '解決済み'}`,
      href: '/console/inquiries',
    })
  }

  return NextResponse.json({ results: results.slice(0, 10) })
}
