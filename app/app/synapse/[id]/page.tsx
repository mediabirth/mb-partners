import { redirect, notFound } from 'next/navigation'
import { createClient, getCachedUid } from '@/lib/supabase/server'
import { getPartnerWithDeals } from '@/lib/supabase/queries'
import { customerHonorific } from '@/lib/customer'
import { inferEntity, synNorm } from '@/lib/synapse-entity'
import SynapseDetailClient, { type DetailContact, type HistoryItem } from './SynapseDetailClient'

// SYNAPSE 資産ページ：つながり1件の詳細（個人/法人を同一体裁・同一機能に統一）。
//  ・台帳(synapse_contacts)由来＝全情報・編集・URL取込・需要分析・紹介アーカイブ・引き継ぎ紹介。
//  ・deal由来（識別子 'deal-<dealId>'）＝開いた時点で台帳に lazy-create（synapse_contacts のみ・本人スコープ）→ 編集可詳細へ redirect。
//    既に名寄せ一致の台帳があれば既存へ redirect（重複防止）。書込は synapse_contacts のみ＝money/帰属/deals 非接触。
// ★本人スコープ（RLSで本人の行のみ）。紹介履歴/deal参照は getPartnerWithDeals の SELECT のみ（書込ゼロ）。お金/deals/帰属に触れない。
export const runtime = 'edge'

const STATUS_LABEL: Record<string, string> = { received: '進行', in_progress: '進行', confirmed: '成約', paid: '支払済', lost: '不成立' }

// このつながり（会社/氏名）に紐づく過去の紹介を read-only で突合。
function buildHistory(deals: any[], co: string, nm: string): HistoryItem[] {
  return deals
    .filter(d => {
      const matchCo = co && synNorm(d.company_name) === co
      const matchNm = nm && (synNorm(d.customer_name) === nm || synNorm(d.contact_name) === nm)
      return matchCo || matchNm
    })
    .map(d => ({ id: d.id, label: customerHonorific(d), service: d.services?.name ?? null, status: STATUS_LABEL[d.status] ?? d.status, date: d.fixed_month ?? d.created_at }))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
}

export default async function SynapseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const uid = await getCachedUid()
  if (!uid) redirect('/login')

  const supabase = await createClient()

  // ── C deal由来：lazy-create→編集可詳細へ redirect（識別子 'deal-<dealId>'） ──────────────
  if (id.startsWith('deal-')) {
    const dealId = id.slice('deal-'.length)
    const [contactsRes, pwd, partnerRes] = await Promise.all([
      supabase.from('synapse_contacts').select('id, name, company'),       // 名寄せ照合（read-only）
      getPartnerWithDeals(supabase, uid),
      supabase.from('partners').select('id').eq('profile_id', uid).single(),  // 本人の partner_id（書込スコープ）
    ])
    const deals = (pwd?.deals ?? []) as any[]
    const deal = deals.find(d => d.id === dealId)
    if (!deal) notFound()

    // 既に名寄せ一致の台帳があれば既存へ（重複防止・冪等）。
    const kc = synNorm(deal.company_name), kn = synNorm(deal.customer_name)
    const match = (contactsRes.data ?? []).find((c: any) => {
      const ck = synNorm(c.company), nk = synNorm(c.name)
      return (kc && (ck === kc || nk === kc)) || (kn && (nk === kn || ck === kn))
    })
    if (match) redirect(`/app/synapse/${match.id}`)

    // lazy-create：synapse_contacts に本人スコープで1行作成（deal の既知値を引き継ぎ）。書込は contacts のみ。
    const partnerId = partnerRes.data?.id
    if (partnerId) {
      const entity = inferEntity(deal.customer_type, deal.company_name, deal.customer_name)
      const insertRow = {
        partner_id: partnerId,
        entity_type: entity,
        company: deal.company_name ?? null,
        name: entity === 'corporate' ? (deal.contact_name ?? deal.customer_name ?? null) : (deal.customer_name ?? null),
        role: entity === 'corporate' && deal.contact_name ? null : null,
        suggested_service: deal.services?.name ?? null,
        source: 'manual',
      }
      const { data: created } = await supabase.from('synapse_contacts').insert(insertRow).select('id').single()
      if (created?.id) redirect(`/app/synapse/${created.id}`)
    }
    // 失敗時フォールバック（作成不可）：一覧へ戻す。
    redirect('/app/synapse')
  }

  // ── 台帳由来（従来の編集可詳細） ───────────────────────────────────────────────────
  const [{ data }, pwd] = await Promise.all([
    supabase.from('synapse_contacts')
      .select('id, name, company, industry, role, relationship, needs, notes, suggested_service, suggested_angle, acted_at, enriched_at, url, company_size, scanned_at, entity_type, phone, address, demand_summary, demand_tags, recommended_services, source, created_at, updated_at')
      .eq('id', id).maybeSingle(),
    getPartnerWithDeals(supabase, uid),
  ])
  if (!data) notFound()
  const c = data as DetailContact

  const history = buildHistory((pwd?.deals ?? []) as any[], synNorm(c.company), synNorm(c.name))

  const aiEnabled = !!process.env.ANTHROPIC_API_KEY
  return <SynapseDetailClient contact={c} aiEnabled={aiEnabled} history={history} />
}
