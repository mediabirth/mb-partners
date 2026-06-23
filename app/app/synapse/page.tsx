import { redirect } from 'next/navigation'
import { createClient, getCachedUid } from '@/lib/supabase/server'
import { getPartnerWithDeals } from '@/lib/supabase/queries'
import { inferEntity, synNorm } from '@/lib/synapse-entity'
import SynapseClient, { type SynapseContact, type ReferredEntry } from './SynapseClient'

// SYNAPSE 一覧：私的台帳(synapse_contacts)＋過去に紹介した顧客(deal由来・SELECT)を1リストに統合。
// ★紹介履歴/deal参照は完全read-only（getPartnerWithDeals＝RLSで本人の自分データのみ）。money/deals/帰属に書き込みゼロ。
// ★synapse_contacts は本人RLS。サービス目録は読むだけ。既存ナビ・3サイト分離は不変。
export const runtime = 'edge'

// 紹介済み＝進行/成約/支払済（lost は除外）。
const STATUS_LABEL: Record<string, string> = { received: '進行', in_progress: '進行', confirmed: '成約', paid: '支払済' }

export default async function SynapsePage() {
  const uid = await getCachedUid()
  if (!uid) redirect('/login')

  const supabase = await createClient()
  // 私的台帳（RLS本人スコープ）＋ 本人の紹介履歴（read-only）を並列取得。
  const [contactsRes, pwd] = await Promise.all([
    supabase.from('synapse_contacts')
      .select('id, name, company, industry, role, relationship, needs, notes, suggested_service, suggested_angle, acted_at, enriched_at, url, company_size, scanned_at, entity_type, phone, address, demand_summary, demand_tags, recommended_services, source, created_at, updated_at')
      .order('created_at', { ascending: false }),
    getPartnerWithDeals(supabase, uid),   // ★read-only：本人の紹介した案件
  ])

  const contacts = (contactsRes.data ?? []) as SynapseContact[]

  // B-1 重複集約：台帳に既にいる人（名前/会社一致）は deal由来から除外＝台帳側を優先。
  const ledgerKeys = new Set<string>()
  for (const c of contacts) { for (const k of [synNorm(c.name), synNorm(c.company)]) if (k) ledgerKeys.add(k) }

  // 過去に紹介した顧客（deal由来）を“読むだけ”で CRM エントリへ。台帳と重複する人は集約。
  const referred: ReferredEntry[] = ((pwd?.deals ?? []) as any[])
    .filter(d => ['received', 'in_progress', 'confirmed', 'paid'].includes(d.status))
    .filter(d => {
      const kc = synNorm(d.company_name), kn = synNorm(d.customer_name)
      return !((kc && ledgerKeys.has(kc)) || (kn && ledgerKeys.has(kn)))   // 台帳にいれば除外（集約）
    })
    .map(d => ({
      id: d.id,
      name: d.customer_name ?? null,
      company: d.company_name ?? null,
      person: d.contact_name ?? null,   // 法人の担当者（副表示・read-only）
      service: d.services?.name ?? null,
      status: STATUS_LABEL[d.status] ?? d.status,
      statusKey: d.status,
      date: d.fixed_month ?? d.created_at,
      // 区分：customer_type 優先、無ければ名前/会社から推定（法人語を含むか）。
      entity: inferEntity(d.customer_type, d.company_name, d.customer_name),
    }))

  const aiEnabled = !!process.env.ANTHROPIC_API_KEY

  return (
    <div className="page-anim">
      <SynapseClient initialContacts={contacts} referred={referred} aiEnabled={aiEnabled} />
    </div>
  )
}
