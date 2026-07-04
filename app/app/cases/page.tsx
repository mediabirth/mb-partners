import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient, getCachedUser } from '@/lib/supabase/server'
import { getPartnerWithDeals } from '@/lib/supabase/queries'
import { customerHonorific } from '@/lib/customer'
import { nextPayoutDate } from '@/lib/payout'
import ServiceAvatar from '@/components/ServiceAvatar'
import EmptyState from '@/components/ui/EmptyState'
import RewardPill from '@/components/ui/RewardPill'
import CasesSearch from '@/components/CasesSearch'
import { rewardValueText } from '@/lib/reward-format'

const STATUS_LABEL: Record<string, string> = {
  received: '受付', in_progress: '対応中', confirmed: '成約', paid: '支払済', lost: '不成立',
}
// ⑥ 段階ステッパー（4段）
const RAIL_STEPS = ['受付', '対応中', '成約', '支払済']
const STATUS_STEP: Record<string, number> = {
  received: 0, in_progress: 1, confirmed: 2, paid: 3,
}

// Wave2-②A：パートナー視点の段階ラベル（既存 status を“読み取って”表示するだけ・status値/遷移/お金は不変更）。
const PARTNER_STAGE: Record<string, string> = {
  received: '受付', in_progress: 'MB対応中', confirmed: '成約', paid: '成約（入金済）', lost: '見送り',
}
// ②A-2：in_progress を review_stage(表示専用メタ)で細分化。未設定は従来「MB対応中」にフォールバック。
function partnerStageLabel(status: string, reviewStage?: string | null): string {
  if (status === 'in_progress') {
    if (reviewStage === 'review') return '稟議中'
    if (reviewStage === 'negotiating') return '商談中'
    return 'MB対応中'
  }
  return PARTNER_STAGE[status] ?? status
}
function fmtDate(s?: string | null): string {
  if (!s) return '—'
  const d = new Date(s)
  // JST明示（getMonth/getDate は実行環境TZ依存＝Edge(UTC)で日付がずれる）
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('ja', { month: 'numeric', day: 'numeric', timeZone: 'Asia/Tokyo' })
}
// ②B深化(b) 報酬の根拠（reward_snapshot を読むだけ・再計算しない）。率 or 固定。
function rewardBasis(snap: unknown): string {
  if (!snap || typeof snap !== 'object') return ''
  const s = snap as { rate?: number; base_label?: string; ref_type?: string; reward_type?: string }
  if (typeof s.rate === 'number' && s.rate > 0) return `${s.base_label ?? '成約額'}の${s.rate}%`
  if (s.ref_type === 'fixed' || s.reward_type === 'fixed') return '固定報酬'
  return ''
}
// ②B深化(a) 未払いの支払予定（既存 lib/payout の翌月末規約・表示用ラベル。お金計算ではない）。
function payoutLabel(fixedMonth?: string | null): string {
  const base = fixedMonth ? new Date(fixedMonth) : new Date()
  if (Number.isNaN(base.getTime())) return '翌月末'
  const d = nextPayoutDate(base)
  return `${d.getFullYear()}年${d.getMonth() + 1}月末`
}

// 4段ステッパー（旧実装の段階表示に回帰）。完了段は塗り、現在段は強調。
function StatusStepper({ step }: { step: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', marginTop: 12 }}>
      {RAIL_STEPS.map((label, i) => {
        const done = i <= step
        const isCurrent = i === step
        const color = i === 3 && done ? 'var(--green)' : 'var(--c-blue)'
        return (
          <div key={label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
            {/* connector to previous node */}
            {i > 0 && (
              <span style={{ position: 'absolute', top: 6, right: '50%', width: '100%', height: 2, background: i <= step ? color : 'var(--line)' }} />
            )}
            <span style={{
              position: 'relative', zIndex: 1, width: isCurrent ? 14 : 12, height: isCurrent ? 14 : 12, borderRadius: '50%',
              background: done ? color : '#fff', border: `2px solid ${done ? color : 'var(--line)'}`,
              boxShadow: isCurrent ? `0 0 0 4px ${i === 3 ? 'var(--green-bg)' : 'var(--blue-bg)'}` : 'none',
            }} />
            <span style={{ fontSize: '.56rem', fontWeight: isCurrent ? 500 : 500, color: done ? 'var(--txt)' : 'var(--muted2)', marginTop: 6 }}>{label}</span>
          </div>
        )
      })}
    </div>
  )
}

export const runtime = 'edge'

export default async function CasesPage({
  searchParams,
}: {
  searchParams: Promise<{ f?: string }>
}) {
  const user = await getCachedUser()
  if (!user) redirect('/login')
  const supabase = await createClient()

  const result = await getPartnerWithDeals(supabase, user.id)
  if (!result) redirect('/login')
  const { partner, deals } = result
  const { f = 'active' } = await searchParams

  // ②B 確定報酬の累計（確定=confirmed/paid の deals.amount＝あなたの報酬・既存計算済み値の読み取り集計のみ。再計算なし）。
  // ②B深化(a) 支払済(paid)/未払い(confirmed) に分割（status を読むだけ・payout/frozenには触れない）。
  const sumBy = (st: string[]) => deals.filter((d: { status: string }) => st.includes(d.status)).reduce((s: number, d: { amount?: number }) => s + (d.amount || 0), 0)
  const paidRewardTotal = sumBy(['paid'])
  const unpaidRewardTotal = sumBy(['confirmed'])
  const confirmedRewardTotal = paidRewardTotal + unpaidRewardTotal

  // Wave3-③A ティア（認知のみ・read-only）：確定成約数から算出。お金/報酬率には一切影響しない。

  // 3タブ：進行中(受付+対応中) / 完了(成約+支払済) / 不成立(lost)。不成立は進行中から除外。
  const filtered = deals.filter(d => {
    if (f === 'done') return ['confirmed', 'paid'].includes(d.status)
    if (f === 'lost') return d.status === 'lost'
    return ['received', 'in_progress'].includes(d.status)  // active（既定）
  })

  // L2: 明細件数（"+N"用）。service role で安全に集計（best-effort・テーブル未作成なら空）。
  const itemCounts: Record<string, number> = {}
  // お客さま向けメニュー名の解決マップ（新 menus）。deal.reward_snapshot->>menu_id → menus.name で新名称表示（改名せず表示のみ）。
  const menuNameById: Record<string, string> = {}
  try {
    const { createServiceRoleClient } = await import('@/lib/supabase/server')
    const admin = await createServiceRoleClient()
    const { data } = await admin.from('deal_items').select('deal_id').in('deal_id', filtered.map(d => d.id))
    for (const r of (data ?? []) as { deal_id: string }[]) itemCounts[r.deal_id] = (itemCounts[r.deal_id] ?? 0) + 1
    const { data: menus } = await admin.from('menus').select('id, name')
    for (const m of (menus ?? []) as { id: string; name: string }[]) menuNameById[m.id] = m.name
  } catch { /* best-effort */ }

  return (
    <div className="page-anim">
      <div style={{ padding: '22px 20px 6px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
          <h2 className="ty-h2">案件</h2>
          <span style={{ fontSize: '.66rem', color: 'var(--muted2)' }}>{filtered.length}件</span>
        </div>
      </div>

      {/* ②B 確定報酬の累計（read-only・確定案件の報酬合計）＋(a)支払済/未払い分割 */}
      <div style={{ margin: '6px 20px 14px', background: 'linear-gradient(135deg,#4733E6 0%,#3A28CE 100%)', color: '#fff', borderRadius: 14, padding: '15px 18px' }}>
        <div style={{ fontSize: '.58rem', opacity: .9, letterSpacing: '.04em', fontWeight: 500 }}>確定報酬の累計</div>
        <div style={{ fontFamily: 'Inter', fontWeight: 500, fontSize: '1.5rem', letterSpacing: '-.02em', marginTop: 4, fontFeatureSettings: '"tnum"' }}>¥{confirmedRewardTotal.toLocaleString()}</div>
        <div style={{ display: 'flex', gap: 16, marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,.25)' }}>
          <div style={{ fontSize: '.56rem', opacity: .85 }}>支払済<b style={{ display: 'block', fontFamily: 'Inter', fontSize: '.84rem', fontWeight: 500, marginTop: 2, fontFeatureSettings: '"tnum"' }}>¥{paidRewardTotal.toLocaleString()}</b></div>
          <div style={{ fontSize: '.56rem', opacity: .85 }}>未払い（翌月末払い見込み）<b style={{ display: 'block', fontFamily: 'Inter', fontSize: '.84rem', fontWeight: 500, marginTop: 2, fontFeatureSettings: '"tnum"' }}>¥{unpaidRewardTotal.toLocaleString()}</b></div>
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', background: 'var(--bg2)', borderRadius: 10, padding: 4, margin: '0 20px 16px' }}>
        {[['active', '進行中'], ['done', '完了'], ['lost', '不成立']].map(([val, lbl]) => (
          <Link key={val} href={`/app/cases?f=${val}`} style={{
            flex: 1, textAlign: 'center', textDecoration: 'none',
            padding: '9px 2px', borderRadius: 8, fontSize: '.7rem', fontWeight: 500,
            color: f === val ? 'var(--txt)' : 'var(--muted2)',
            background: f === val ? '#fff' : 'transparent',
            boxShadow: f === val ? '0 2px 8px rgba(14,14,20,.08)' : 'none',
          }}>
            {lbl}
          </Link>
        ))}
      </div>

      {/* 磨き③（改善）: 検索（6件以上で表示・クライアント絞り込みのみ） */}
      <CasesSearch total={filtered.length} />

      {/* Deal list */}
      <div style={{ padding: '0 20px' }}>
        {filtered.length === 0 ? (
          <EmptyState
            title="まだ案件はありません"
            hint="「紹介する」ボタンから案件を登録しましょう。"
            icon={
              <span style={{ display: 'inline-flex', width: 52, height: 52, borderRadius: 15, background: 'var(--blue-bg2)', border: '1px solid var(--blue-bg)', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--c-blue)" strokeWidth="1.6"><path d="M4 6h16M4 12h16M4 18h10" /></svg>
              </span>
            }
          />
        ) : (
          <div className="stagger" style={{ display: 'flex', flexDirection: 'column' }}>
            {filtered.map(d => {
              // deal_list_card_v3：上段＝ブランドアイコン32px＋名前様＋メニュー名＋右端 報酬ピル／下段＝ミニ進捗レール（4点）。
              const name = customerHonorific(d) || (d as { company_name?: string; customer_name?: string }).company_name || (d as { customer_name?: string }).customer_name || 'お客さま'
              const snapMenuId = ((d as { reward_snapshot?: { menu_id?: string } | null }).reward_snapshot)?.menu_id
              const menuName = (snapMenuId && menuNameById[snapMenuId]) || (d as { service_menus?: { name?: string } | null }).service_menus?.name || (d.services ? d.services.name : '相談（サービス未定）')
              // 報酬ピル文言：reward_snapshot（凍結報酬）から値/率のみ。無ければ確定金額。★money表示値は既存計算を読むだけ。
              const snap = (d as { reward_snapshot?: { reward_type?: string; reward_value?: number | string } | null }).reward_snapshot
              const rewardText = snap?.reward_type
                ? rewardValueText({ reward_type: snap.reward_type as 'fixed' | 'rate' | 'continuous', reward_value: snap.reward_value ?? 0 })
                : (d.amount > 0 ? `¥${d.amount.toLocaleString()}` : '')
              const step = STATUS_STEP[d.status] ?? 0
              const lost = d.status === 'lost'
              return (
                <Link key={d.id} href={`/app/cases/${d.id}`} className="card-hover lift ui-card"
                  data-case-search={`${name}${menuName}`.normalize('NFKC').toLowerCase().replace(/\s+/g, '')}
                  style={{ display: 'block', textDecoration: 'none', color: 'var(--txt)', background: '#fff', border: '0.5px solid var(--line)', borderRadius: 14, padding: '14px 15px', marginBottom: 10 }}>
                  {/* 上段：ブランドアイコン32px＋名前様/メニュー名＋報酬ピル */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                    {d.services
                      ? <ServiceAvatar logoPath={d.services.logo_path} icon={d.services.icon} color={d.services.color} name={d.services.name} size={32} />
                      : <ServiceAvatar logoPath={null} icon="" color="#9A9CA8" name="相談" size={32} />}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
                      <div style={{ fontSize: 12, color: 'var(--muted2)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{menuName}</div>
                    </div>
                    {rewardText && <RewardPill style={{ flexShrink: 0 }}>{rewardText}</RewardPill>}
                  </div>
                  {/* 下段：ミニ進捗レール（4点ドット＋区間線・通過=accent／ラベル4語・現在地のみaccent500） */}
                  {lost ? (
                    <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 11 }}>不成立（見送り）</p>
                  ) : (
                    <div style={{ marginTop: 13 }}>
                      <div style={{ display: 'flex', alignItems: 'center', margin: '0 3px 5px' }}>
                        {RAIL_STEPS.map((s, i) => (
                          <span key={i} style={{ display: 'contents' }}>
                            <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: i <= step ? 'var(--c-blue)' : '#fff', border: i <= step ? 'none' : '1px solid var(--line)', display: 'inline-block' }} />
                            {i < 3 && <span style={{ height: 1.5, flex: 1, background: i < step ? 'var(--c-blue)' : 'var(--line)' }} />}
                          </span>
                        ))}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        {RAIL_STEPS.map((s, i) => (
                          <span key={i} style={{ fontSize: 10, color: i === step ? 'var(--c-blue)' : 'var(--muted2)', fontWeight: i === step ? 500 : 400 }}>{s}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </Link>
              )
            })}
          </div>
        )}
      </div>
      <div style={{ height: 20 }} />
    </div>
  )
}
