import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'

// SYNAPSE Phase 0：私的台帳 synapse_contacts の一覧/作成（partner本人のみ・隔離）。
// ★お金・deals・frontier・/r帰属・既存通知には一切触れない。常に“リクエスト元本人の partner_id”にスコープ。
export const runtime = 'edge'

const FIELDS = ['name', 'company', 'industry', 'role', 'relationship', 'needs', 'notes', 'suggested_service', 'suggested_angle', 'url', 'company_size', 'entity_type', 'phone', 'address'] as const

async function resolvePartnerId(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: partner } = await supabase.from('partners').select('id').eq('profile_id', user.id).single()
  return partner?.id ?? null
}

function clean(b: any) {
  const out: Record<string, string | null> = {}
  for (const f of FIELDS) out[f] = typeof b?.[f] === 'string' && b[f].trim() ? b[f].trim().slice(0, 2000) : null
  return out
}

export async function GET() {
  const partnerId = await resolvePartnerId()
  if (!partnerId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const admin = await createServiceRoleClient()
  const { data } = await admin
    .from('synapse_contacts')
    .select('id, name, company, industry, role, relationship, needs, notes, suggested_service, suggested_angle, acted_at, enriched_at, url, company_size, scanned_at, entity_type, phone, address, demand_summary, demand_tags, recommended_services, source, created_at, updated_at')
    .eq('partner_id', partnerId)
    .order('created_at', { ascending: false })
  return NextResponse.json({ contacts: data ?? [] })
}

export async function POST(req: NextRequest) {
  try {
    const partnerId = await resolvePartnerId()
    if (!partnerId) return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })
    const b = await req.json().catch(() => ({}))
    const fields = clean(b)
    // 最低限：何か1つは入力されていること。
    if (!Object.values(fields).some(Boolean)) return NextResponse.json({ error: '内容を入力してください' }, { status: 400 })
    const source = ['interview', 'card', 'manual'].includes(b?.source) ? b.source : 'manual'
    const admin = await createServiceRoleClient()
    const { data, error } = await admin
      .from('synapse_contacts')
      .insert({ partner_id: partnerId, ...fields, source })
      .select('id, name, company, industry, role, relationship, needs, notes, suggested_service, suggested_angle, acted_at, enriched_at, url, company_size, scanned_at, entity_type, phone, address, demand_summary, demand_tags, recommended_services, source, created_at, updated_at')
      .single()
    if (error) return NextResponse.json({ error: '保存に失敗しました' }, { status: 500 })
    return NextResponse.json({ contact: data })
  } catch {
    return NextResponse.json({ error: '保存に失敗しました' }, { status: 500 })
  }
}
