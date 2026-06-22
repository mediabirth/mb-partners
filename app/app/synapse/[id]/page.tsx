import { redirect, notFound } from 'next/navigation'
import { createClient, getCachedUid } from '@/lib/supabase/server'
import { getPartnerWithDeals } from '@/lib/supabase/queries'
import { customerHonorific } from '@/lib/customer'
import SynapseDetailClient, { type DetailContact, type HistoryItem } from './SynapseDetailClient'

// SYNAPSE 資産ページ：つながり1件の詳細。全情報・編集・URL取込・需要分析・紹介アーカイブ・引き継ぎ紹介。
// ★本人スコープ（RLSで本人の行のみ）。紹介履歴は getPartnerWithDeals の SELECT のみ（書込ゼロ）。お金/deals/帰属に触れない。
export const runtime = 'edge'

const STATUS_LABEL: Record<string, string> = { received: '進行', in_progress: '進行', confirmed: '成約', paid: '支払済', lost: '不成立' }
const norm = (s: string | null | undefined) => (s ?? '').replace(/\s|　|株式会社|（株）|\(株\)|有限会社|合同会社/g, '').toLowerCase()

export default async function SynapseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const uid = await getCachedUid()
  if (!uid) redirect('/login')

  const supabase = await createClient()
  // 本人の連絡先（RLS）＋ 本人の紹介履歴（read-only）を並列取得。
  const [{ data }, pwd] = await Promise.all([
    supabase.from('synapse_contacts')
      .select('id, name, company, industry, role, relationship, needs, notes, suggested_service, suggested_angle, acted_at, enriched_at, url, company_size, scanned_at, entity_type, phone, address, demand_summary, demand_tags, recommended_services, source, created_at, updated_at')
      .eq('id', id).maybeSingle(),
    getPartnerWithDeals(supabase, uid),
  ])
  if (!data) notFound()
  const c = data as DetailContact

  // C：このつながりに紐づく過去の紹介を 名前/会社 で突合（読み取りのみ・金額は出さない）。
  const co = norm(c.company), nm = norm(c.name)
  const history: HistoryItem[] = ((pwd?.deals ?? []) as any[])
    .filter(d => {
      const matchCo = co && norm(d.company_name) === co
      const matchNm = nm && (norm(d.customer_name) === nm || norm(d.contact_name) === nm)
      return matchCo || matchNm
    })
    .map(d => ({ id: d.id, label: customerHonorific(d), service: d.services?.name ?? null, status: STATUS_LABEL[d.status] ?? d.status, date: d.fixed_month ?? d.created_at }))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  const aiEnabled = !!process.env.ANTHROPIC_API_KEY
  return <SynapseDetailClient contact={c} aiEnabled={aiEnabled} history={history} />
}
