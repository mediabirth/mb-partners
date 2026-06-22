import { redirect, notFound } from 'next/navigation'
import { createClient, getCachedUid } from '@/lib/supabase/server'
import SynapseDetailClient, { type DetailContact } from './SynapseDetailClient'

// SYNAPSE 名簿化（N2）：つながり1件の詳細ページ。全情報・編集・URL取込(SYNAPSE)・再度紹介。
// ★本人スコープ（RLSで本人の行のみ取得）。お金/deals/帰属には触れない。再度紹介は既存フローへのリンクのみ。
export const runtime = 'edge'

export default async function SynapseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const uid = await getCachedUid()
  if (!uid) redirect('/login')

  // RLS（本人のみ）。他人の行は返らない＝見えない。
  const supabase = await createClient()
  const { data } = await supabase
    .from('synapse_contacts')
    .select('id, name, company, industry, role, relationship, needs, notes, suggested_service, suggested_angle, acted_at, enriched_at, url, company_size, scanned_at, entity_type, phone, address, demand_summary, demand_tags, source, created_at, updated_at')
    .eq('id', id)
    .maybeSingle()

  if (!data) notFound()

  const aiEnabled = !!process.env.ANTHROPIC_API_KEY
  return <SynapseDetailClient contact={data as DetailContact} aiEnabled={aiEnabled} />
}
