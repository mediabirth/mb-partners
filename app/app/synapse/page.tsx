import { redirect } from 'next/navigation'
import { createClient, getCachedUid } from '@/lib/supabase/server'
import { getPartnerWithDeals } from '@/lib/supabase/queries'
import { customerHonorific } from '@/lib/customer'
import SynapseClient, { type SynapseContact, type ReferredEntry } from './SynapseClient'

// SYNAPSE 再構成：まず“自分専用CRM”。本人の紹介履歴(read-only)＋私的台帳(synapse_contacts)を1リストに。
// ★紹介履歴は完全read-only（getPartnerWithDeals＝anon＋RLSで本人の自分データのみ）。money/deals/帰属に書き込みゼロ。
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
      .select('id, name, company, industry, role, relationship, needs, notes, suggested_service, suggested_angle, acted_at, enriched_at, url, company_size, scanned_at, source, created_at, updated_at')
      .order('created_at', { ascending: false }),
    getPartnerWithDeals(supabase, uid),   // ★read-only：本人の紹介した案件
  ])

  const contacts = (contactsRes.data ?? []) as SynapseContact[]

  // 紹介履歴を CRM エントリへ（本人の自分データを“読むだけ”・再計算なし）。
  const referred: ReferredEntry[] = ((pwd?.deals ?? []) as any[])
    .filter(d => ['received', 'in_progress', 'confirmed', 'paid'].includes(d.status))
    .map(d => ({
      id: d.id,
      name: customerHonorific(d),
      company: d.company_name ?? null,
      service: d.services?.name ?? null,
      status: STATUS_LABEL[d.status] ?? d.status,
      statusKey: d.status,
      amount: typeof d.amount === 'number' ? d.amount : null,
      date: d.fixed_month ?? d.created_at,
    }))

  const aiEnabled = !!process.env.ANTHROPIC_API_KEY

  return (
    <div className="page-anim">
      <SynapseClient initialContacts={contacts} referred={referred} aiEnabled={aiEnabled} />
    </div>
  )
}
